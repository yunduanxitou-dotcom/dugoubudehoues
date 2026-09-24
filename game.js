
"use strict";

/* ============================================================
   0. 素材：荒诞抵押物 + 三档杠杆
   ============================================================ */
const COLLATERAL_POOL = [
  "祖传泡面盖", "隔壁老王的塑料凳", "一枚写着「再来一次」的硬币",
  "发圈上最爱的限量橡皮", "高中三年的错题本", "只剩一只的蓝牙耳机",
  "室友的考研英语词汇书", "外婆的腌菜坛子", "会唱歌的电子贺卡",
  "半箱没拆的快递", "传说中的第四块拼图", "一张过期的游泳卡",
  "存了三年的表情包硬盘", "自称能许愿的鹅卵石", "印着校徽的保温杯",
  "全场唯一的备用充电线", "写满「下次一定」的便利贴", "一只假装是猫的拖鞋",
  "用了四年的鼠标垫", "宿舍门后那块活动海报"
];

// 杠杆越高 → 借得越多，但「借到手」的概率越低
const LEVERAGE = [
  { key: "light", name: "轻杠杆", mult: 1, rate: 0.90, desc: "稳稳续命" },
  { key: "mid",   name: "中杠杆", mult: 3, rate: 0.60, desc: "搏一把"   },
  { key: "heavy", name: "加杠杆", mult: 8, rate: 0.30, desc: "一步登天，或一步归西" }
];

const AVATAR_COLORS = ["#ffcf5c", "#7ee0ff", "#a9f3c4", "#ffa8c5", "#c9a6ff", "#ffbe8a"];

/* ============================================================
   1. 全局状态（整个游戏就靠这一个对象活着）
   ------------------------------------------------------------
   state 就是「记分牌 + 现在轮到谁 + 桌上有多少钱」的记事本。
   每次用户点按钮 → 改 state → 调 render() 把 state 画到屏幕上。
   ============================================================ */
const state = {
  phase: "setup",     // setup | idle | flipping | choice | borrow | over
  players: [],        // 玩家数组
  turn: 0,            // 现在轮到 players 数组的第几个
  pot: 0,             // 桌上筹码（本手押上去的钱）
  base: 100,          // 初始风浪币（借钱额度的基准）
  round: 0,           // 第几手（每次抛币 +1）
  coinRot: 0,         // 硬币当前旋转角度（只用来做动画）
  lastResult: null,   // 最近一次结果 'head' | 'tail'
  busy: false,        // 锁：硬币还在天上时，禁止再抛一次
  stakePct: 100,      // 本手押注占手上筹码的百分比（1~100，100 = 全押）
  flipTimer: null     // 抛币动画的计时器；玩家中途撤离时要取消它，免得结算到别人头上
};

// 押注快捷档：比例 + 显示名字
const STAKE_PRESETS = [
  { pct: 10,  label: "10%"  },
  { pct: 25,  label: "25%"  },
  { pct: 50,  label: "50%"  },
  { pct: 100, label: "全 押" }
];

/**
 * 算出这位玩家本手要押多少筹码。
 * 100% 时直接返回全部（一分不差），其它比例四舍五入，并夹在 1 ~ 全部 之间。
 */
function stakeAmount(p) {
  if (!p || p.coins <= 0) return 0;
  if (state.stakePct >= 100) return p.coins;
  return Math.min(p.coins, Math.max(1, Math.round(p.coins * state.stakePct / 100)));
}

/* ============================================================
   2. 小工具
   ============================================================ */
const $ = (id) => document.getElementById(id);

function randInt(n) { return Math.floor(Math.random() * n); }

/** 真随机 50/50 —— 唯一的随机来源，没有任何权重修正 */
function flipCoin() { return Math.random() < 0.5 ? "head" : "tail"; }

/** 从池子里随机抽 n 个不重复的抵押物 */
function drawCollateral(n) {
  const pool = COLLATERAL_POOL.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(randInt(pool.length), 1)[0]);
  return out;
}

function current() { return state.players[state.turn]; }

/* ============================================================
   3. 日志
   ============================================================ */
let logCount = 0;      // 本场已经记了多少条（显示在「风浪日志」标题旁的角标里）

function log(text, kind) {
  const li = document.createElement("div");
  li.className = "li " + (kind || "dim");
  li.textContent = text;
  const box = $("log");
  box.appendChild(li);
  box.scrollTop = box.scrollHeight;
  logCount++;
  $("logCount").textContent = logCount;
}

function clearLog() {
  $("log").innerHTML = "";
  logCount = 0;
  $("logCount").textContent = "";
}

function flash(color) {
  const f = $("flash");
  f.className = "";
  void f.offsetWidth;          // 强制浏览器重排，让动画能重播
  f.className = color;
}

function shake() {
  document.body.classList.remove("shake");
  void document.body.offsetWidth;
  document.body.classList.add("shake");
}

/* ============================================================
   4. 设置页
   ============================================================ */
let playerCount = 3;

function renderSetup() {
  // (1) 人数按钮
  const chips = $("countChips");
  chips.innerHTML = "";
  for (let n = 2; n <= 6; n++) {
    const b = document.createElement("button");
    b.className = "chip" + (n === playerCount ? " on" : "");
    b.textContent = n + " 人";
    b.onclick = () => { playerCount = n; renderSetup(); };
    chips.appendChild(b);
  }

  // (2) 名字输入框（保留已输入的内容）
  const grid = $("nameGrid");
  const old = [...grid.querySelectorAll("input")].map((i) => i.value);
  grid.innerHTML = "";
  for (let i = 0; i < playerCount; i++) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = "玩家 " + (i + 1);
    const inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 8;
    inp.value = old[i] || ("玩家" + (i + 1));
    wrap.appendChild(lab); wrap.appendChild(inp);
    grid.appendChild(wrap);
  }
}

function startGame() {
  const names = [...$("nameGrid").querySelectorAll("input")].map((i) => i.value.trim() || "无名氏");
  const startCoins = Math.max(10, Number($("startCoins").value) || 100);
  const collNum = Math.max(0, Math.min(10, Number($("collateralNum").value) || 0));

  state.base = startCoins;
  state.players = names.map((name, i) => ({
    id: i,
    name: name,
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    coins: startCoins,
    collateral: drawCollateral(collNum),   // 剩下的荒诞物品
    alive: true,
    streak: 0,        // 当前连击
    bestStreak: 0,    // 本场最长连击
    peak: startCoins, // 本场最高资产（高光时刻）
    wipeouts: 0,      // 被清零次数
    borrows: 0,       // 成功借钱次数
    debt: 0           // 抵押借钱产生的负债（结算时从资产里扣）
  }));
  state.turn = 0;
  state.pot = 0;
  state.round = 0;
  state.phase = "idle";
  state.coinRot = 0;
  state.stakePct = 100;      // 新的一局从「全押」开始（想保守就自己拉滑杆）
  state.busy = false;

  $("setup").classList.remove("active");
  $("game").classList.add("active");
  $("over").classList.remove("show");
  clearLog();
  log("—— 开局。每人 " + startCoins + " 风浪币，" + collNum + " 件荒诞抵押物 ——", "big");
  beginTurn();
  render();
}

/* ============================================================
   5. 回合流程（游戏的心脏）
   ------------------------------------------------------------
   beginTurn()：轮到一个玩家时，先看他还有没有钱
       有钱   → 阶段 idle，等他按「抛硬币」
       没钱   → 阶段 borrow，让他抵押借钱；没抵押物了 = 出局
   ============================================================ */
function beginTurn() {
  const p = current();

  // 跳过已经出局的人
  if (!p.alive) { nextTurn(); return; }

  if (p.coins <= 0) {
    if (p.collateral.length > 0) {
      state.phase = "borrow";
      log(p.name + " 手上一个风浪币都没有了，得抵押点东西换钱……", "loan");
    } else {
      p.alive = false;
      log("💀 " + p.name + " 连抵押物都用光了，彻底下桌。", "tail");
      nextTurn();
      return;
    }
  } else {
    state.phase = "idle";
  }
}

/** 换下一位玩家（自动跳过出局的） */
function nextTurn() {
  // 已经收场了（比如玩家刚撤离触发结算），迟到的换人定时器不该再把游戏拉起来
  if (state.phase === "over") return;

  state.pot = 0;

  // 关键规则：场上只剩一位玩家，本场直接结束。
  // 一个人对着硬币抛没意思 —— 抛硬币对赌至少得有两个人才成立。
  if (endGameIfTooFew()) return;

  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const idx = (state.turn + step) % total;
    if (state.players[idx].alive) {
      state.turn = idx;
      beginTurn();
      render();
      return;
    }
  }
}

/** 场上还有几个活人 */
function aliveCount() { return state.players.filter((p) => p.alive).length; }

/** 该收场了吗：活人不足两位（0 个或 1 个） */
function shouldEndGame() { return aliveCount() <= 1; }

/** 人不够了就收场。返回 true 表示本局已经结束。 */
function endGameIfTooFew() {
  if (!shouldEndGame()) return false;
  const left = state.players.filter((p) => p.alive);
  endGame(left.length === 1
    ? "场上只剩 " + left[0].name + " 一个人，抛硬币没对手了"
    : "所有人都下桌了");
  return true;
}

/** 结束整局：定格状态 → 重画 → 弹出散场总结 */
function endGame(reason) {
  state.phase = "over";
  state.pot = 0;
  state.busy = false;
  log("🏁 " + (reason || "散场") + "。", "big");
  render();
  showOver(reason);
}

/* ============================================================
   6. 抛硬币
   ============================================================ */
function doFlip() {
  if (state.busy) return;                 // 锁着就忽略，防止连点抛两枚
  if (state.phase === "over") return;

  const p = current();
  const stake = stakeAmount(p);

  // 兜底：桌上没钱、手上也没钱可押，就不该抛（正常流程走不到这里）
  if (state.pot === 0 && stake <= 0) { render(); return; }

  // 第一次抛：把「本手押注」推上桌，剩余筹码留在手上；继续浪时 pot 已经有值，跳过
  if (state.pot === 0) {
    state.pot = stake;
    p.coins -= stake;
    log("▶ " + p.name + " 押上 " + stake + " 风浪币"
        + (p.coins > 0 ? "（手上还留着 " + p.coins + "）" : "（全押！）") + "。");
  }

  state.busy = true;
  state.phase = "flipping";
  render();

  const result = flipCoin();
  state.lastResult = result;
  state.round++;

  // 动画：硬币正面朝上由「本次结果」决定，跟历史累计的转数无关。
  // 先看现在停在哪个角度，再转到目标面（正=0°、反=180°），并额外多转 6 整圈。
  // 否则转数越攒越多，连续正面会因为之前出现过奇数个「反」而显示成「反」。
  const target = result === "head" ? 0 : 180;
  const now = state.coinRot % 360;              // 现在朝上的角度（0~359）
  const turn = ((target - now) + 360) % 360;    // 转到目标面还差多少（只会是 0 或 180）
  state.coinRot += 360 * 6 + turn;
  $("coin").style.transform = "rotateY(" + state.coinRot + "deg)";

  // 等动画播完（1.4 秒）再结算；存下计时器，玩家中途撤离时好取消它
  state.flipTimer = setTimeout(() => { state.busy = false; state.flipTimer = null; settle(result); }, 1400);
}

function settle(result) {
  // 玩家在硬币空中就撤离了：flipTimer 已被取消，这里不该再结算到别人头上
  if (state.phase === "over") return;

  const p = current();

  if (result === "head") {
    /* ---------- 正面：桌上筹码翻倍 ---------- */
    state.pot *= 2;
    p.streak++;
    if (p.streak > p.bestStreak) p.bestStreak = p.streak;
    flash("gold");
    $("potVal").classList.add("pop");
    setTimeout(() => $("potVal").classList.remove("pop"), 420);

    const cheer = p.streak >= 5 ? " 🔥 连中 " + p.streak + " 次！"
                : p.streak >= 3 ? " 手气有点热…"
                : "";
    log("🪙 正面！" + p.name + " 桌上筹码翻倍 → " + state.pot + cheer, "head");

    state.phase = "choice";   // 由玩家自己决定收还是浪
    render();

  } else {
    /* ---------- 反面：桌上筹码全被卷走 ---------- */
    const lost = state.pot;
    state.pot = 0;
    p.streak = 0;
    p.wipeouts++;
    flash("red");
    shake();
    log("🌊 反面！" + p.name + " 押的 " + lost + " 风浪币被浪卷走了"
        + (p.coins > 0 ? "，手上还剩 " + p.coins + "。" : "，手上清零。"), "tail");

    render();
    setTimeout(() => nextTurn(), 700);   // 让玩家看一眼「0」再换人
  }
}

/* ============================================================
   7. 正面之后：见好就收 / 继续浪
   ============================================================ */
function keepWinnings() {
  const p = current();
  p.coins += state.pot;
  if (p.coins > p.peak) p.peak = p.coins;

  const got = state.pot;
  state.pot = 0;
  log("💰 " + p.name + " 见好就收，落袋 " + got + " 风浪币（现共 " + p.coins + "）。", "big");
  flash("gold");
  nextTurn();
}

function pressOn() {
  const p = current();
  log("🎲 " + p.name + " 选择继续浪：整堆 " + state.pot + " 风浪币再押一次！", "big");
  doFlip();          // pot 已经不为 0，所以直接进入抛币结算
}

/* ============================================================
   8. 抵押借钱
   ============================================================ */
function doBorrow(level) {
  const p = current();
  const item = p.collateral.shift();          // 抵押物先交出去（无论成败都要交）
  const amount = state.base * level.mult;
  const success = Math.random() < level.rate;

  if (success) {
    p.coins += amount;
    p.borrows++;
    p.debt += amount;              // 借到手的钱记成负债，结算时要还
    if (p.coins > p.peak) p.peak = p.coins;
    log("✅ " + p.name + " 抵押「" + item + "」换来 " + amount + " 风浪币（负债 +" + amount + "），重新进场。", "loan");
    flash("gold");
  } else {
    log("❌ " + p.name + " 抵押「" + item + "」想借 " + amount + " 风浪币 —— 人家没批，东西也没了。", "loan");
    shake();
  }

  state.pot = 0;
  render();

  // 借完还得再判断一次：可能一件抵押物都不剩了
  if (p.coins <= 0 && p.collateral.length === 0) {
    p.alive = false;
    log("💀 " + p.name + " 借不到钱，也没东西可押了，下桌。", "tail");
    state.phase = "waiting";   // 这 0.6 秒里不给按钮，免得玩家点到「空手抛币」
    render();
    setTimeout(() => nextTurn(), 600);
  } else if (p.coins <= 0) {
    state.phase = "borrow";    // 还能再押一件
    render();
  } else {
    state.phase = "idle";      // 借到钱了，接着抛
    render();
  }
}

/* ============================================================
   9. 渲染（把 state 画到屏幕上）
   ============================================================ */
// 「中途退出」两段式确认用到的两个小变量（放这里，保证任何渲染发生前都已初始化）
let armedId = null;      // 已经被点了第一下、正在等确认的玩家
let armTimer = null;

function render() {
  // 收场后「撤离」按钮就没了，顺手把还在等确认的卡片取消掉
  if (armedId !== null && !canQuitVoluntarily()) {
    clearTimeout(armTimer);
    armedId = null;
  }
  renderPlayers();
  renderStage();
  $("roundMeta").textContent = "第 " + Math.max(1, state.round) + " 手 · " + state.players.filter(p => p.alive).length + " 人在场";
}

function renderPlayers() {
  const box = $("players");
  box.innerHTML = "";
  state.players.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "pcard" + (i === state.turn && state.phase !== "over" ? " cur" : "") + (p.alive ? "" : " out");

    const av = document.createElement("div");
    av.className = "avatar";
    av.style.background = p.color;
    av.textContent = p.name.slice(0, 1);

    // ---- 待确认撤离：整张卡切成确认态，避免按钮把卡片挤变形 ----
    if (armedId === p.id) {
      d.classList.add("armed");
      const ask = document.createElement("div");
      ask.className = "quit-ask";
      const t = document.createElement("div");
      t.className = "qa-t";
      t.innerHTML = "让 <b>" + p.name + "</b> 撤离？";
      const row = document.createElement("div");
      row.className = "qa-btns";
      const yes = document.createElement("button");
      yes.className = "quit-yes"; yes.textContent = "确定撤离";
      yes.onclick = () => { clearTimeout(armTimer); armedId = null; quitGame(p.id); };
      const no = document.createElement("button");
      no.className = "quit-no"; no.textContent = "取消";
      no.onclick = () => { clearTimeout(armTimer); armedId = null; renderPlayers(); };
      row.appendChild(yes); row.appendChild(no);
      ask.appendChild(t); ask.appendChild(row);
      d.appendChild(av); d.appendChild(ask);
      box.appendChild(d);
      return;
    }

    const info = document.createElement("div");
    info.className = "info";
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = p.name;
    const co = document.createElement("div");
    co.className = "coins" + (p.coins <= 0 ? " zero" : "");
    co.textContent = p.coins.toLocaleString();
    const it = document.createElement("button");
    it.type = "button";
    it.className = "items";
    it.innerHTML = "🏷 抵押物 <b>" + p.collateral.length + "</b> ▾"
        + (p.streak >= 2 ? '<span class="streak-badge">🔥' + p.streak + "连中</span>" : "");
    it.title = "点开查看 " + p.name + " 的抵押物";
    it.onclick = () => openCollateral(p.id);
    info.appendChild(nm); info.appendChild(co);
    // 有负债就实时标出来（红字），结算时要从资产里扣
    if (p.debt > 0) {
      const db = document.createElement("div");
      db.className = "debt";
      db.textContent = "负债 " + p.debt.toLocaleString();
      info.appendChild(db);
    }
    info.appendChild(it);

    d.appendChild(av); d.appendChild(info);
    if (!p.alive) {
      const t = document.createElement("span");
      t.className = "tag"; t.textContent = "已下桌";
      d.appendChild(t);
    } else if (state.phase !== "over") {
      if (i === state.turn) {
        const t = document.createElement("span");
        t.className = "tag"; t.textContent = "该你了";
        d.appendChild(t);
      }
      // 任何人数都能中途撤离（走完只剩一人会当场收场）
      if (canQuitVoluntarily()) {
        const q = document.createElement("button");
        q.className = "quit-btn";
        q.textContent = "撤离";
        q.title = p.name + " 中途撤离（下桌）";
        q.onclick = () => armQuit(p.id);
        d.appendChild(q);
      }
    }
    box.appendChild(d);
  });
}

/* --- 中途撤离：两段式确认，避免一指点掉半局游戏 --- */

/** 是否允许中途撤离：只要游戏没结束，任何人数都能走（走完只剩一人会当场收场） */
function canQuitVoluntarily() {
  return state.phase !== "over";
}

function armQuit(id) {
  if (!canQuitVoluntarily()) return;
  if (armedId === id) {                     // 第二下：确认走人
    clearTimeout(armTimer);
    armedId = null;
    quitGame(id);
    return;
  }
  armedId = id;                             // 第一下：进入待确认
  renderPlayers();
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { armedId = null; renderPlayers(); }, 4000);  // 4 秒没确认就自动取消
}

/** 某位玩家中途撤离 = 直接下桌；只剩一人时整局收场 */
function quitGame(id) {
  const p = state.players[id];
  if (!p || !p.alive || state.phase === "over") return;

  const isCurrent = (id === state.turn);
  const abandoned = isCurrent ? state.pot : 0;   // 走的人如果正押着钱，桌上的筹码没人管了

  // 当前玩家在硬币还在天上时撤离：取消还没结算的抛币，别把结果算到下一位头上
  if (isCurrent) {
    clearTimeout(state.flipTimer);
    state.flipTimer = null;
    state.busy = false;
  }

  p.alive = false;
  log("🚪 " + p.name + " 中途撤离，下桌。"
      + (abandoned > 0 ? "桌上那 " + abandoned + " 风浪币没人管，被浪收走。" : ""), "tail");

  armedId = null;
  if (endGameIfTooFew()) return;                 // 只剩一人 → 整局结束
  if (isCurrent) nextTurn();                     // 走的正好是当前玩家 → 换人
  else { render(); }                             // 别人退场，当前回合不受影响
}

/* ============================================================
   抵押物查询弹窗
   ============================================================ */
function openCollateral(id) {
  const p = state.players[id];
  if (!p) return;

  const av = $("collAvatar");
  av.textContent = p.name.slice(0, 1);
  av.style.background = p.color;
  $("collTitle").textContent = p.name + " 的抵押物";
  $("collSub").textContent = p.collateral.length
    ? "共 " + p.collateral.length + " 件，点「知道了」关闭"
    : "一件都押不出来了";

  const list = $("collList");
  list.innerHTML = "";
  if (!p.collateral.length) {
    const e = document.createElement("div");
    e.className = "coll-item empty";
    e.textContent = "空空如也";
    list.appendChild(e);
  } else {
    p.collateral.forEach((item) => {
      const e = document.createElement("div");
      e.className = "coll-item";
      e.innerHTML = '<span class="ico">🏷</span><span>' + item + "</span>";
      list.appendChild(e);
    });
  }
  $("collModal").classList.add("show");
}

function closeCollateral() { $("collModal").classList.remove("show"); }

function renderStage() {
  const p = current();
  const actions = $("actions");
  const slot = $("borrowSlot");
  slot.innerHTML = "";               // 借钱面板每次重画，避免出现两份
  actions.innerHTML = "";

  if (state.phase === "over") {
    $("turnName").textContent = "散场";
    $("turnSub").textContent = "";
    $("potVal").textContent = "0";
    $("potVal").classList.add("dim");
    $("stakeBox").style.display = "none";
    return;
  }

  // 桌上有多少筹码
  $("potVal").textContent = state.pot.toLocaleString();
  $("potVal").classList.toggle("dim", state.pot === 0);

  // 连击提示
  $("streak").innerHTML = p.streak >= 1
    ? "当前连中 <b>" + p.streak + "</b> 次" + (p.streak >= 3 ? " —— 越滚越大，要不要收？" : "")
    : "";

  // ---------- 各阶段显示不同按钮 ----------
  if (state.phase === "idle") {
    $("turnName").textContent = p.name + " 的回合";
    $("turnSub").textContent = "手上 " + p.coins.toLocaleString() + " 风浪币 · 押多少你说了算";
    actions.appendChild(mkBtn("抛 硬 币", "btn-flip", doFlip, false));

  } else if (state.phase === "flipping") {
    $("turnName").textContent = "硬币在天上转……";
    $("turnSub").textContent = "别眨眼";
    actions.appendChild(mkBtn("抛 硬 币", "btn-flip", doFlip, true));

  } else if (state.phase === "choice") {
    $("turnName").textContent = "正面！" + p.name + " 你选";
    $("turnSub").textContent = "桌上已经滚到 " + state.pot.toLocaleString() + " 风浪币";
    actions.appendChild(mkBtn("见 好 就 收", "btn-keep", keepWinnings, false));
    actions.appendChild(mkBtn("继 续 浪", "btn-push", pressOn, false));

  } else if (state.phase === "waiting") {
    // 短暂过渡态：等 0.6 秒换人，期间不给任何按钮
    $("turnName").textContent = p.name + " 下桌了";
    $("turnSub").textContent = "换下一位……";
    actions.appendChild(mkBtn("抛 硬 币", "btn-flip", doFlip, true));

  } else if (state.phase === "borrow") {
    $("turnName").textContent = p.name + " 没钱了";
    $("turnSub").textContent = "抵押一件荒诞物品，换筹码重新进场（还剩 " + p.collateral.length + " 件）";

    const tpl = $("borrowTpl").content.cloneNode(true);
    slot.appendChild(tpl);           // 长在赌桌正下方，不需要滚屏

    // 列出你现在能押哪些东西 —— 每件一个醒目标签，先看清楚自己的家底
    const itemsBox = $("borrowItems");
    if (itemsBox) {
      itemsBox.innerHTML = '<div class="borrow-items-label">你现在能押（会随机押出一件）：</div>'
        + '<div class="borrow-tags">'
        + (p.collateral.length
            ? p.collateral.map((i) => '<span class="borrow-tag">🏷 ' + i + "</span>").join("")
            : '<span class="borrow-tag" style="opacity:.55">一件都没有了</span>')
        + "</div>";
    }

    const row = $("levRow");
    LEVERAGE.forEach((lv) => {
      const b = document.createElement("button");
      b.className = "lev-btn";
      b.innerHTML = '<div class="n">' + lv.name + "</div>"
                  + '<div class="a">' + (state.base * lv.mult).toLocaleString() + "</div>"
                  + '<div class="r">到手概率 ' + Math.round(lv.rate * 100) + "%</div>"
                  + '<div class="d">' + lv.desc + "</div>";
      b.onclick = () => doBorrow(lv);
      row.appendChild(b);
    });
  }

  renderStake();          // 押注调节器放在最后画，这样它能顺便改抛币按钮上的字
}

/**
 * 画押注调节器。
 * 只在「本轮还没押注」的 idle 阶段出现；一旦押上桌，滑杆就收起来。
 * 只更新文字和滑杆填充色，不重建滑杆本身 —— 否则拖着拖着手感就断了。
 */
function renderStake() {
  const box = $("stakeBox");
  const show = state.phase === "idle" && state.pot === 0 && current().coins > 0;
  box.style.display = show ? "" : "none";
  if (!show) return;

  const p = current();
  const stake = stakeAmount(p);
  const rest = p.coins - stake;

  $("stakeNum").textContent = stake.toLocaleString();
  $("stakePct").textContent = state.stakePct >= 100 ? "全押 100%" : state.stakePct + "% 手上";
  $("stakeNote").innerHTML = "手上 <b>" + p.coins.toLocaleString() + "</b> · 押 <b>"
      + stake.toLocaleString() + "</b> · 留 <b>" + rest.toLocaleString() + "</b>";

  const r = $("stakeRange");
  if (r.value !== String(state.stakePct)) r.value = String(state.stakePct);
  r.style.background = "linear-gradient(90deg, var(--gold) 0%, var(--gold) " + state.stakePct
                     + "%, #2a3554 " + state.stakePct + "%, #2a3554 100%)";

  const q = $("stakeQuick");
  q.innerHTML = "";
  STAKE_PRESETS.forEach((preset) => {
    const b = document.createElement("button");
    b.className = state.stakePct === preset.pct ? "on" : "";
    b.textContent = preset.label;
    b.onclick = () => { state.stakePct = preset.pct; renderStake(); };
    q.appendChild(b);
  });

  // 抛币按钮直接把注码写在脸上，免得玩家没注意押了多少
  const flipBtn = document.querySelector("#actions .btn-flip");
  if (flipBtn && !flipBtn.disabled) flipBtn.textContent = "抛 硬 币（押 " + stake.toLocaleString() + "）";
}

function mkBtn(text, cls, fn, disabled) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  b.disabled = !!disabled;
  b.onclick = fn;
  return b;
}

/* ============================================================
   10. 散场总结 · 结算排行
   净资产 = 最终风浪币 − 抵押借钱产生的负债，按净资产从高到低排
   ============================================================ */
function showOver(reason) {
  $("overSub").textContent = reason ? reason + " · 结算完毕" : "一场狂欢到此为止";

  const list = $("recapList");
  list.innerHTML = "";

  // 排行：按净资产（风浪币 - 负债）从高到低
  const ranked = state.players
    .map((p) => Object.assign({}, p, { net: p.coins - p.debt }))
    .sort((a, b) => b.net - a.net);

  const MEDALS = ["🥇", "🥈", "🥉"];
  ranked.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "recap rank rank-" + (i + 1) + (p.alive ? "" : " out-rec");
    const medal = MEDALS[i] || (i + 1);
    const netCls = p.net < 0 ? " neg" : "";

    d.innerHTML =
      '<div class="rank-no">' + medal + "</div>"
      + '<div class="rank-body">'
      +   '<div class="r1"><span class="nm" style="color:' + p.color + '">' + p.name
      +   (p.alive ? "" : ' <span class="out-tag">已下桌</span>') + "</span>"
      +   '<span class="fin' + netCls + '">' + p.net.toLocaleString() + "</span></div>"
      +   '<div class="r2">风浪币 ' + p.coins.toLocaleString()
      +   (p.debt > 0 ? " · 负债 " + p.debt.toLocaleString() : "")
      +   " · 最高 " + p.peak.toLocaleString()
      +   " · 连中 " + p.bestStreak + " 次"
      +   " · 借 " + p.borrows + " 次</div>"
      + "</div>";
    list.appendChild(d);
  });
  $("over").classList.add("show");
}

/* ============================================================
   11. 事件绑定
   ============================================================ */
$("startBtn").onclick = startGame;
$("endBtn").onclick = () => endGame("大家决定散场");
$("againBtn").onclick = () => {
  $("over").classList.remove("show");
  $("game").classList.remove("active");
  $("setup").classList.add("active");
  state.phase = "setup";
};

// 抵押物查询弹窗：三种关闭方式（点 ✕ / 点「知道了」/ 点遮罩空白处）
$("collClose").onclick = closeCollateral;
$("collDone").onclick = closeCollateral;
$("collModal").addEventListener("click", (e) => {
  if (e.target === $("collModal")) closeCollateral();
});

// 拖滑杆 = 改押注比例（1% ~ 100%）
$("stakeRange").addEventListener("input", (e) => {
  state.stakePct = Math.max(1, Math.min(100, Number(e.target.value) || 1));
  renderStake();
});

// 键盘快捷键
document.addEventListener("keydown", (e) => {
  // Esc 优先关闭抵押物弹窗（无论处于哪个阶段）
  if (e.code === "Escape") {
    if ($("collModal").classList.contains("show")) { closeCollateral(); return; }
  }
  if (state.phase === "idle" || state.phase === "flipping") {
    // 左右键微调押注（每次 5%）。滑杆自己拿到焦点时交给浏览器原生处理，免得调两遍。
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      if (e.target && e.target.id === "stakeRange") return;
      e.preventDefault();
      const delta = e.code === "ArrowRight" ? 5 : -5;
      state.stakePct = Math.max(1, Math.min(100, state.stakePct + delta));
      renderStake();
      return;
    }
    if (e.code === "Space") { e.preventDefault(); if (state.phase === "idle") doFlip(); }
  } else if (state.phase === "choice") {
    if (e.code === "Space")  { e.preventDefault(); pressOn(); }
    if (e.code === "Enter")  { e.preventDefault(); keepWinnings(); }
  }
});

/* 启动 */
renderSetup();
