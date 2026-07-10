import type { User } from "../types/domain.js";

export function resolveTitle(user: User) {
  if (user.wins >= 100) return "万人敌";
  if (user.wins >= 50) return "千人斩";
  if (user.wins >= 20) return "兄弟圈主角";
  if (user.wins >= 10) return "十秒传说";
  if (user.wins >= 5) return "嘴硬转正";
  if (user.wins >= 3) return "小有手感";
  if (user.wins >= 1) return "刚会点";
  if (user.losses >= 10) return "逆袭伏笔";
  if (user.losses >= 5) return "嘴硬研究生";
  if (user.losses >= 3) return "复仇观察员";
  return "神秘手指";
}

