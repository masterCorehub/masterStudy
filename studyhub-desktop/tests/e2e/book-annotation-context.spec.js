import { test, expect } from "playwright/test";
import { preparePreview, previewState } from "./fixtures/calendarPreview.js";

test("Book details show the selected passage for new and linked legacy notes", async ({ page }) => {
  await preparePreview(page, {
    state: { ...previewState, books: { list: [{ id: "book", title: "Livro anotado", author: "Autor", status: "READING", notes: [
      { id: "word-note", page: 2, selectedText: "efêmero", content: "Minha definição dessa palavra" },
      { id: "legacy-note", page: 3, content: "Meu comentário antigo" },
      { id: "page-note", page: 3, content: "Anotação sobre a página inteira" },
    ], highlights: [{ id: "legacy-highlight", page: 3, linkedAnnotationId: "legacy-note", text: "A frase que foi marcada" }] }] } },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "Ver Detalhes", exact: true }).click();
  await page.getByRole("button", { name: /Anotações/ }).click();
  await expect(page.getByTestId("annotation-excerpt")).toHaveCount(2);
  await expect(page.getByTestId("annotation-excerpt").first()).toContainText("efêmero");
  await expect(page.getByTestId("annotation-excerpt").nth(1)).toContainText("A frase que foi marcada");
  await expect(page.getByText("Minha definição dessa palavra", { exact: true })).toBeVisible();
  await expect(page.getByText("Meu comentário antigo", { exact: true })).toBeVisible();
  await expect(page.getByText("Anotação sobre a página inteira", { exact: true })).toBeVisible();
});
