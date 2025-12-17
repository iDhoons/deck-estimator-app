import { ko } from "./ko";

// 지금은 한국 사용자 전용: ko 고정
export const t = ko;

// 나중에 다국어 필요하면 이런 형태로 확장:
// import { en } from "./en";
// export const t = lang === "en" ? en : ko;
