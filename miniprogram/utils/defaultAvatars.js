const DEFAULT_AVATARS = [
  { text: "嘴", theme: "red" },
  { text: "硬", theme: "yellow" },
  { text: "点", theme: "blue" },
  { text: "装", theme: "green" },
  { text: "赢", theme: "pink" },
  { text: "菜", theme: "gray" },
  { text: "怒", theme: "red" },
  { text: "冲", theme: "yellow" },
  { text: "燃", theme: "blue" },
  { text: "服", theme: "green" },
  { text: "哈", theme: "pink" },
  { text: "裂", theme: "gray" }
];

function pickDefaultAvatar() {
  return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
}

module.exports = {
  pickDefaultAvatar
};
