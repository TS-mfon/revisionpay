import { expect, test } from "@playwright/test";

test("visitors can play, seek and download the captioned demo under three minutes", async ({
  page,
}) => {
  await page.goto("/judges#video");
  const video = page.getByLabel("RevisionPay product demo");
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  const duration = await video.evaluate(
    (element: HTMLVideoElement) => element.duration,
  );
  expect(duration).toBeGreaterThan(40);
  expect(duration).toBeLessThan(180);
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(0.5);
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = element.duration - 5;
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(duration - 4.5);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.error),
  ).toBeNull();
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  const captions = await page.request.get("/media/revisionpay-demo.en.vtt");
  expect(captions.ok()).toBe(true);
  expect(await captions.text()).toContain(
    "simulates PayPal payments and AI results",
  );
  const download = page.getByRole("link", { name: "Download the demo MP4" });
  await expect(download).toHaveAttribute("download", "RevisionPay-demo.mp4");
  const media = await page.request.get("/media/revisionpay-demo.mp4", {
    headers: { Range: "bytes=0-1023" },
  });
  expect(media.status()).toBe(206);
  expect(media.headers()["content-type"]).toContain("video/mp4");
  expect((await media.body()).byteLength).toBe(1024);
});
