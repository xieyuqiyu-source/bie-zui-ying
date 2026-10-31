// Every game shown on the hub. To add a game, append an entry and point
// `entry` at its lobby page; games without an entry show as "coming soon".
const GAMES = [
  {
    id: "tap",
    name: "十秒手速",
    glyph: "点",
    accent: "#e33124",
    tagline: "10 秒疯狂点屏幕，手速说了算。",
    tags: ["双人实时", "10 秒"],
    entry: "/pages/home/home"
  },
  {
    id: "bus",
    name: "追赶巴士",
    glyph: "追",
    accent: "#1f5a4a",
    tagline: "一个疯狂转方向盘，一个左右脚狂奔，追上车门算你狠。",
    tags: ["双人实时", "15 秒", "一开一追"],
    entry: "/pages/bus/lobby/lobby"
  },
  {
    id: "coffin",
    name: "双人抬棺",
    glyph: "棺",
    accent: "#5b3a29",
    tagline: "两人一前一后抬着走，稳住别把人颠下来，最后倒进坑里。",
    tags: ["双人合作", "物理", "20 秒"],
    entry: "/pages/coffin/lobby/lobby"
  },
  {
    id: "reaction",
    name: "反应对决",
    glyph: "快",
    accent: "#2f6fed",
    tagline: "变色那一刻拍下去，早拍算输。",
    tags: ["双人", "比反应"]
  },
  {
    id: "rps",
    name: "猜拳心理战",
    glyph: "拳",
    accent: "#2fb36b",
    tagline: "三局两胜，看谁先被看穿。",
    tags: ["双人", "三局两胜"]
  },
  {
    id: "bond",
    name: "兄弟默契",
    glyph: "懂",
    accent: "#8b4fd8",
    tagline: "同一道题，答得一样才算懂你。",
    tags: ["双人", "默契"]
  }
];

module.exports = {
  GAMES
};
