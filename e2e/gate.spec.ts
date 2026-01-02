import { test, expect } from "@playwright/test";

test("게이트 화면이 렌더링되고 시작 버튼이 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "데크 견적기" })).toBeVisible();
  await expect(page.getByText("시작 모드를 선택하세요.")).toBeVisible();

  await expect(page.getByRole("button", { name: "일반 모드로 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "전문가 모드로 시작" })).toBeVisible();
});
