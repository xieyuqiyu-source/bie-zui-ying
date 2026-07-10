const inviteTalks = [
  "别嘴硬，10 秒钟见真章。",
  "你的手速，配得上你的嘴硬吗？",
  "来，给你的嘴硬找个证据。",
  "十秒以后，我们重新定义兄弟地位。"
];

const winTalks = [
  "你赢了，但请保持基本的嚣张。",
  "本场认证：手速有点东西。",
  "你已临时获得兄弟圈发言权。",
  "对方还没输，只是在整理说辞。",
  "你的手指完成了一次小型登基。"
];

const loseTalks = [
  "你输了，但表情管理很到位。",
  "系统检测到：你还有很大的嘴硬空间。",
  "别急，复仇剧本正在生成。",
  "你离胜利只差一点点，以及很多点。"
];

const drawTalks = [
  "这局谁也别装，大家都差不多。",
  "兄弟地位暂未更新，请加赛。",
  "平局，建议你们现场掰扯。"
];

function pick(items: string[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export const trashTalkService = {
  invite: () => pick(inviteTalks),
  win: () => pick(winTalks),
  lose: () => pick(loseTalks),
  draw: () => pick(drawTalks)
};

