export const DEFAULT_BOOK_CATEGORIES = Object.freeze([
  { id: "category-romance", name: "Romance", icon: "favorite" },
  { id: "category-fiction", name: "Ficção", icon: "auto_stories" },
  { id: "category-fantasy", name: "Fantasia", icon: "wand_stars" },
  { id: "category-mystery", name: "Mistério", icon: "search" },
  { id: "category-biography", name: "Biografia", icon: "person_book" },
  { id: "category-history", name: "História", icon: "history_edu" },
  { id: "category-science", name: "Ciência", icon: "science" },
  { id: "category-technology", name: "Tecnologia", icon: "code" },
  { id: "category-philosophy", name: "Filosofia", icon: "psychology" },
  { id: "category-other", name: "Outros", icon: "more_horiz" },
]);

const normalized = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export const allBookCategories = custom => [...DEFAULT_BOOK_CATEGORIES, ...(custom || [])];
export function validateBookCategoryName(categories, name, exceptId) {
  const result = String(name || "").trim().replace(/\s+/g, " ");
  if (!result) throw new Error("Digite o nome da categoria.");
  if (result.length > 40) throw new Error("Use um nome com até 40 caracteres.");
  if (categories.some(category => category.id !== exceptId && normalized(category.name) === normalized(result))) throw new Error("Já existe uma categoria com esse nome.");
  return result;
}
export function booksInCategory(books, categories, selected = "all") {
  if (selected === "all") return books;
  const ids = new Set(categories.map(category => category.id));
  return books.filter(book => selected === "uncategorized" ? !ids.has(book.categoryId) : book.categoryId === selected);
}
export function removeBookCategory(custom, books, id) {
  return {
    bookCategories: custom.filter(category => category.id !== id),
    books: { list: books.map(book => book.categoryId === id ? { ...book, categoryId: null, categoryAssignmentSource: "manual" } : book) },
  };
}
export function migrateBookCategories(state = {}) {
  if (Array.isArray(state.bookCategories)) return { bookCategories: state.bookCategories, books: state.books || { list: [] } };
  const custom = [];
  const remap = new Map();
  for (const folder of state.bookFolders || []) {
    const preset = DEFAULT_BOOK_CATEGORIES.find(category => normalized(category.name) === normalized(folder.name));
    if (preset) remap.set(folder.id, preset.id);
    else {
      const category = { id: `category-custom-${folder.id}`, name: folder.name, custom: true, createdAt: folder.createdAt || Date.now() };
      custom.push(category);
      remap.set(folder.id, category.id);
    }
  }
  const list = (state.books?.list || []).map(book => ({
    ...book,
    categoryId: book.categoryId || remap.get(book.folderId) || null,
    categoryAssignmentSource: book.categoryAssignmentSource || book.folderAssignmentSource || "manual",
  }));
  return { bookCategories: custom, books: { ...(state.books || {}), list } };
}
