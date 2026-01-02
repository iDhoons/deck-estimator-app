import { test, expect } from "@playwright/test";

test("일반 모드로 진입하면 캔버스/패널이 렌더링된다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "일반 모드로 시작" }).click();

  // 상단 타이틀 + 모드 표시
  await expect(page.getByRole("heading", { name: "데크 견적기" })).toBeVisible();
  await expect(page.getByText("모드: 일반")).toBeVisible();

  // 캔버스 섹션
  await expect(page.getByText("데크 캔버스")).toBeVisible();

  // 좌측 주요 버튼 존재 확인
  await expect(page.getByRole("button", { name: "직사각형" })).toBeVisible();
  await expect(page.getByRole("button", { name: "결과 보기" })).toBeVisible();
});
