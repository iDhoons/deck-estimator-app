export function fmtM2(v: number) {
  return `${v.toFixed(2)} m²`;
}

export function fmtRate(v: number) {
  return v.toFixed(3);
}

export function fmtInt(v: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(v));
}

export function fmtWon(v: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(v)) + "원";
}
