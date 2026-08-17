import React, { useState, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

import { SCREEN_IDS } from "../app/screenIds";

export function CampusFlowBooksScreen({ onNavigate }) {
  const books = useStudyStore((state) => state.books?.list || []);
  const addBook = useStudyStore((state) => state.addBook);
  const updateBook = useStudyStore((state) => state.updateBook);
  const deleteBook = useStudyStore((state) => state.deleteBook);
  const setActiveBook = useStudyStore((state) => state.setActiveBook);
  
  const [activeTab, setActiveTab] = useState("ALL BOOKS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", edition: "", tags: "", totalPages: "", coverUrl: "" });
  const filteredBooks = useMemo(() => {
    if (activeTab === "ALL BOOKS") return books;
    if (activeTab === "READING") return books.filter(b => b.status === "READING");
    if (activeTab === "TO READ") return books.filter(b => b.status === "TO READ");
    if (activeTab === "FINISHED") return books.filter(b => b.status === "DONE");
    return books;
  }, [books, activeTab]);

  const currentlyReadingBook = useMemo(() => {
    const readingBooks = books.filter(b => b.status === "READING");
    if (readingBooks.length === 0) return books[0] || null; // Fallback to any book if none is READING
    // Return the most recently updated one, or just the first
    return readingBooks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  }, [books]);

  const handleSelectBookFile = async () => {
    const result = await window.studyhubDesktop?.selectFile({
      properties: ["openFile"],
      filters: [
        { name: "Livros (PDF, EPUB)", extensions: ["pdf", "epub"] },
      ],
    });
    if (!result) return;
    const pathStr = Array.isArray(result)
      ? result[0]
      : (typeof result === 'string' ? result : result?.filePath || result?.filePaths?.[0]);
    if (pathStr) {
      setNewBook(prev => ({ ...prev, filePath: pathStr }));
    }
  };

  const handleAddBook = (e) => {
    e.preventDefault();
    if (!newBook.title.trim()) return;
    
    addBook({
      title: newBook.title,
      author: newBook.author || "Autor desconhecido",
      edition: newBook.edition || "",
      tags: newBook.tags ? newBook.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      totalPages: Number(newBook.totalPages) || 100,
      coverUrl: newBook.coverUrl || "",
      filePath: newBook.filePath || null,
      status: "TO READ"
    });
    
    setNewBook({ title: "", author: "", edition: "", tags: "", totalPages: "", coverUrl: "", filePath: "" });
    setShowAddForm(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewBook(prev => ({ ...prev, coverUrl: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const updateProgress = (bookId, currentPages, totalPages) => {
    const newPages = Math.min(Math.max(0, currentPages), totalPages);
    let newStatus = "READING";
    if (newPages === 0) newStatus = "TO READ";
    if (newPages >= totalPages) newStatus = "DONE";
    
    updateBook(bookId, { readPages: newPages, status: newStatus });
  };

  return (
    <main className="flex h-full flex-col bg-[color:var(--background)] overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="mb-8 flex items-end justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--on-surface)]">
            Lendo Atualmente
          </h1>
          {currentlyReadingBook && (
            <span className="text-xs font-medium text-[color:var(--on-surface-variant)] uppercase tracking-wider">
              Última atualização às {new Date(currentlyReadingBook.updatedAt || currentlyReadingBook.createdAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' })}
            </span>
          )}
        </header>

        {/* Hero Section */}
        {currentlyReadingBook ? (
          <section className="neo-raised mb-12 flex flex-col md:flex-row rounded-3xl bg-[color:var(--surface-container-low)] p-8 border border-[color:var(--outline-variant)]/10 shadow-sm relative overflow-hidden">
            <div className="shrink-0 mb-6 md:mb-0 md:mr-10 relative z-10 w-[200px] h-[300px]">
              {currentlyReadingBook.coverUrl ? (
                <img src={currentlyReadingBook.coverUrl} alt="Capa" className="w-full h-full object-cover rounded-xl shadow-lg border border-[color:var(--outline-variant)]/20" />
              ) : (
                <div className="w-full h-full bg-[color:var(--surface-container-highest)] rounded-xl shadow-lg border border-[color:var(--outline-variant)]/20 flex flex-col items-center justify-center p-4 text-center">
                  <span className="text-[color:var(--on-surface-variant)] text-xs font-bold uppercase opacity-50 mb-2">Capa indisponível</span>
                  <span className="text-[color:var(--on-surface)] font-serif font-bold leading-tight">{currentlyReadingBook.title}</span>
                </div>
              )}
              {currentlyReadingBook.tags && currentlyReadingBook.tags[0] && (
                <span className="absolute -top-3 -right-3 bg-[color:var(--on-surface)] text-[color:var(--surface)] text-[9px] font-bold px-2 py-1 uppercase rounded-sm shadow-md">
                  {currentlyReadingBook.tags[0]}
                </span>
              )}
            </div>
            
            <div className="flex-1 flex flex-col justify-center relative z-10">
              <h2 className="text-4xl font-bold text-[color:var(--on-surface)] mb-2 tracking-tight leading-tight">
                {currentlyReadingBook.title}
              </h2>
              <p className="text-[color:var(--on-surface-variant)] text-lg mb-4 flex items-center gap-2">
                {currentlyReadingBook.author} 
                {currentlyReadingBook.edition && <span className="opacity-70">• {currentlyReadingBook.edition}</span>}
              </p>
              
              {currentlyReadingBook.tags && currentlyReadingBook.tags.length > 0 && (
                <div className="flex gap-2 mb-6 flex-wrap">
                  {currentlyReadingBook.tags.map((tag, idx) => (
                    <span key={idx} className="bg-[color:var(--surface)] text-[color:var(--on-surface)] text-[9px] font-bold px-3 py-1 uppercase rounded-sm shadow-sm border border-[color:var(--outline-variant)]/10">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              
              <div className="mb-8">
                <div className="flex justify-between text-sm font-bold text-[color:var(--on-surface-variant)] mb-3">
                  <span>Progresso: {Math.round((currentlyReadingBook.readPages / currentlyReadingBook.totalPages) * 100)}%</span>
                  <span>{currentlyReadingBook.readPages} / {currentlyReadingBook.totalPages} páginas</span>
                </div>
                <div className="h-2 w-full bg-[color:var(--outline-variant)]/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[color:var(--on-surface)] rounded-full transition-all duration-500" 
                    style={{ width: `${Math.round((currentlyReadingBook.readPages / currentlyReadingBook.totalPages) * 100)}%` }} 
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setActiveBook(currentlyReadingBook.id);
                    if (window.studyhubDesktop?.openBookReaderWindow) {
                      window.studyhubDesktop.openBookReaderWindow(currentlyReadingBook.id);
                    } else {
                      onNavigate(SCREEN_IDS.BOOK_READER);
                    }
                  }}
                  className="bg-[color:var(--on-surface)] text-[color:var(--surface)] font-bold text-xs px-6 py-3 rounded uppercase tracking-widest hover:bg-[color:var(--on-surface-variant)] transition-colors shadow-md flex items-center gap-2"
                >
                  <Icon name="auto_stories" className="text-[16px]" />
                  Continuar Lendo
                </button>
                <button 
                  onClick={() => {
                    setActiveBook(currentlyReadingBook.id);
                    onNavigate(SCREEN_IDS.BOOK_DETAILS);
                  }}
                  className="bg-transparent text-[color:var(--on-surface-variant)] font-bold text-xs px-6 py-3 rounded uppercase tracking-widest hover:text-[color:var(--on-surface)] transition-colors border border-[color:var(--outline-variant)]/30"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="neo-raised mb-12 rounded-3xl bg-[color:var(--surface-container-low)] p-12 text-center border border-[color:var(--outline-variant)]/10 shadow-sm">
            <h2 className="text-xl font-bold text-[color:var(--on-surface-variant)] mb-2">Nenhum livro cadastrado</h2>
            <p className="text-sm text-[color:var(--on-surface-variant)]/70 mb-6">Comece sua biblioteca adicionando sua primeira leitura.</p>
            <button onClick={() => setShowAddForm(true)} className="bg-[color:var(--on-surface)] text-[color:var(--surface)] px-6 py-3 rounded-lg font-bold shadow-md hover:bg-[color:var(--on-surface-variant)] transition-colors uppercase tracking-widest text-xs">
              Adicionar Livro
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center justify-between mb-8 border-b border-[color:var(--outline-variant)]/20 pb-4">
          <div className="flex gap-8">
            {[
              { id: "ALL BOOKS", label: "Todos", count: books.length },
              { id: "READING", label: "Lendo", count: books.filter(b => b.status === "READING").length },
              { id: "TO READ", label: "Quero Ler", count: books.filter(b => b.status === "TO READ").length },
              { id: "FINISHED", label: "Concluídos", count: books.filter(b => b.status === "DONE").length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-4 -mb-[17px] text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === tab.id ? 'text-[color:var(--on-surface)]' : 'text-[color:var(--on-surface-variant)]/60 hover:text-[color:var(--on-surface)]'}`}
              >
                {tab.label} <span className="opacity-70">({tab.count})</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[color:var(--on-surface)]" />
                )}
              </button>
            ))}
          </div>
          
          <div className="flex gap-4 text-[color:var(--on-surface-variant)]">
            <button className="hover:text-[color:var(--on-surface)]"><Icon name="grid_view" /></button>
            <button className="hover:text-[color:var(--on-surface)]"><Icon name="view_list" /></button>
          </div>
        </div>

        {/* Books Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {filteredBooks.map(book => (
            <article 
              key={book.id} 
              className="group relative flex flex-col cursor-pointer"
              onClick={() => {
                setActiveBook(book.id);
                onNavigate(SCREEN_IDS.BOOK_DETAILS);
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Deseja realmente excluir o livro "${book.title || 'Selecionado'}"?`)) {
                    deleteBook(book.id);
                  }
                }}
                className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 text-white bg-red-500 hover:bg-red-600 rounded-full w-6 h-6 flex items-center justify-center transition-all shadow-md"
                title="Excluir livro"
              >
                <Icon name="delete" className="text-[12px]" />
              </button>
              
              <div 
                className="bg-[color:var(--surface-container-low)] aspect-[2/3] w-full shadow-sm border border-[color:var(--outline-variant)]/10 p-3 mb-4 transition-transform group-hover:-translate-y-2 relative overflow-hidden flex flex-col items-center justify-center text-center"
              >
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt="Capa" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <span className="text-[color:var(--on-surface-variant)] text-[10px] font-bold uppercase opacity-50 mb-2">Capa indisponível</span>
                    <span className="text-[color:var(--on-surface)] font-serif font-bold text-sm leading-tight px-2">{book.title}</span>
                  </>
                )}
                {book.status === "DONE" && (
                  <div className="absolute top-3 right-3 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 shadow-sm uppercase">Concluído</div>
                )}
                {book.status === "TO READ" && (
                  <div className="absolute top-3 right-3 bg-[color:var(--surface)] text-[color:var(--on-surface)] text-[9px] font-bold px-2 py-0.5 shadow-sm uppercase border border-[color:var(--outline-variant)]/20">Quero Ler</div>
                )}
                {book.status === "READING" && (
                  <div className="absolute top-3 right-3 bg-blue-500 text-white text-[9px] font-bold px-2 py-0.5 shadow-sm uppercase">Lendo</div>
                )}

                <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setActiveBook(book.id);
                      if (window.studyhubDesktop?.openBookReaderWindow) {
                        window.studyhubDesktop.openBookReaderWindow(book.id);
                      } else {
                        onNavigate(SCREEN_IDS.BOOK_READER);
                      }
                    }} 
                    className="bg-[color:var(--primary)] text-white text-[10px] font-bold py-1.5 rounded border border-white/20 uppercase hover:opacity-90 transition-colors shadow-lg flex items-center justify-center gap-1"
                  >
                    <Icon name="auto_stories" className="text-[12px]" />
                    Ler Livro
                  </button>
                  {book.status !== "TO READ" && (
                    <button onClick={(e) => { e.stopPropagation(); updateBook(book.id, { status: "TO READ", readPages: 0 }); }} className="bg-black/70 backdrop-blur-md text-white text-[9px] font-bold py-1 rounded border border-white/10 uppercase hover:bg-[color:var(--primary)] transition-colors shadow-lg">Mudar p/ Quero Ler</button>
                  )}
                  {book.status !== "READING" && (
                    <button onClick={(e) => { e.stopPropagation(); updateBook(book.id, { status: "READING", readPages: Math.max(1, book.readPages || 1) }); }} className="bg-black/70 backdrop-blur-md text-white text-[9px] font-bold py-1 rounded border border-white/10 uppercase hover:bg-blue-500 transition-colors shadow-lg">Mudar p/ Lendo</button>
                  )}
                  {book.status !== "DONE" && (
                    <button onClick={(e) => { e.stopPropagation(); updateBook(book.id, { status: "DONE", readPages: book.totalPages }); }} className="bg-black/70 backdrop-blur-md text-white text-[9px] font-bold py-1 rounded border border-white/10 uppercase hover:bg-green-500 transition-colors shadow-lg">Mudar p/ Concluído</button>
                  )}
                </div>
              </div>
              
              <h3 className="font-bold text-[color:var(--on-surface)] text-sm leading-tight mb-1 truncate" title={book.title}>{book.title}</h3>
              <p className="text-[color:var(--on-surface-variant)] text-[11px] mb-3 truncate">{book.author}</p>
              
              <div className="mt-auto">
                <div className="flex justify-between items-center text-[9px] font-bold text-[color:var(--on-surface-variant)] mb-2 uppercase tracking-wider">
                  <span>{book.readPages}/{book.totalPages} pgs</span>
                  {book.status === "TO READ" ? (
                    <span className="text-transparent">0%</span>
                  ) : book.status === "DONE" ? (
                    <span className="text-green-600">DONE</span>
                  ) : (
                    <span>{Math.round((book.readPages / book.totalPages) * 100)}%</span>
                  )}
                </div>
                <div className="h-1 w-full bg-[color:var(--outline-variant)]/20 overflow-hidden">
                  <div 
                    className={`h-full ${book.status === "DONE" ? 'bg-green-500' : 'bg-[color:var(--on-surface)]'}`}
                    style={{ width: `${Math.round((book.readPages / book.totalPages) * 100)}%` }} 
                  />
                </div>
              </div>
            </article>
          ))}
          
          {/* Add New Book Placeholder */}
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex flex-col items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] hover:bg-[color:var(--primary)]/5 transition-colors bg-transparent aspect-[2/3] w-full border border-dashed border-[color:var(--outline-variant)]/50 p-4 mb-4"
          >
            <div className="w-10 h-10 rounded-full border border-current flex items-center justify-center mb-3">
              <Icon name="add" className="text-[20px]" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-center">Adicionar Livro</span>
          </button>
        </div>
      </div>

      {/* Add Book Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleAddBook} className="neo-raised bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
            <button type="button" onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]">
              <Icon name="close" />
            </button>
            <h2 className="text-xl font-bold mb-6 text-[color:var(--on-surface)]">Adicionar Livro</h2>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Título *</label>
                <input required type="text" value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})} className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Autor</label>
                  <input type="text" value={newBook.author} onChange={e => setNewBook({...newBook, author: e.target.value})} className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Edição/Info</label>
                  <input type="text" value={newBook.edition} onChange={e => setNewBook({...newBook, edition: e.target.value})} placeholder="Ex: 2nd Edition" className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Tags (separadas por vírgula)</label>
                <input type="text" value={newBook.tags} onChange={e => setNewBook({...newBook, tags: e.target.value})} placeholder="Ex: Computer Science, Quarter 3" className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Total de Páginas *</label>
                <input required type="number" min="1" value={newBook.totalPages} onChange={e => setNewBook({...newBook, totalPages: e.target.value})} className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Capa do Livro (URL ou Upload)</label>
                <div className="flex gap-2">
                  <input type="url" value={newBook.coverUrl} onChange={e => setNewBook({...newBook, coverUrl: e.target.value})} placeholder="URL da imagem (https://...)" className="flex-1 w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--on-surface)]" />
                  <label className="cursor-pointer bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 flex items-center justify-center transition-colors shadow-sm" title="Fazer upload de imagem do PC">
                    <Icon name="upload_file" className="text-[20px] text-[color:var(--on-surface-variant)]" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Arquivo do Livro (PDF / EPUB)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    readOnly 
                    value={newBook.filePath ? newBook.filePath.split(/[\/\\]/).pop() : ""} 
                    placeholder="Nenhum arquivo selecionado" 
                    className="flex-1 w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm outline-none text-[color:var(--on-surface)] truncate" 
                  />
                  <button
                    type="button"
                    onClick={handleSelectBookFile}
                    className="bg-[color:var(--primary)] text-white font-bold text-xs px-4 py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0"
                  >
                    <Icon name="attach_file" className="text-[16px]" />
                    {newBook.filePath ? "Alterar" : "Escolher"}
                  </button>
                </div>
              </div>
            </div>
            
            <button type="submit" disabled={!newBook.title || !newBook.totalPages} className="w-full mt-8 bg-[color:var(--on-surface)] text-[color:var(--surface)] font-bold py-3 rounded-xl shadow-md disabled:opacity-50 transition-all hover:bg-[color:var(--on-surface-variant)] uppercase tracking-widest text-xs">
              Salvar Livro
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
