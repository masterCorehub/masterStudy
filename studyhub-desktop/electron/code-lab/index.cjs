const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const {
  chatWithOllama,
  getOllamaStatus,
  startOllama,
} = require("../ai/ollama-service.cjs");

const moduleNames = [
  "Console e primeiros programas",
  "Variáveis, tipos e operadores",
  "Condições e repetições",
  "Métodos e depuração",
  "Strings, arrays, coleções e LINQ",
  "Orientação a objetos e exceções",
];
const moduleLessons = [
  { explanation: "Um programa C# executa instruções de cima para baixo. Console.WriteLine mostra texto e Console.ReadLine lê uma linha.", example: "Console.WriteLine(\"Ola\");\nvar nome = Console.ReadLine();", checklist: ["Entender entrada e saída", "Executar um programa simples", "Ler mensagens do compilador"] },
  { explanation: "Variáveis guardam valores. int serve para inteiros, double para decimais e string para texto. Parse converte texto lido do console.", example: "var idade = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(idade + 1);", checklist: ["Escolher tipos", "Converter texto", "Usar operadores"] },
  { explanation: "Condições escolhem caminhos e laços repetem tarefas. Uma expressão booleana sempre resulta em true ou false.", example: "if (nota >= 6) Console.WriteLine(\"Aprovado\");", checklist: ["Comparar valores", "Usar if ou switch", "Repetir com for e while"] },
  { explanation: "Métodos dividem problemas em partes menores. Eles recebem parâmetros, devolvem valores e tornam o código mais fácil de testar.", example: "static int Dobro(int valor) => valor * 2;", checklist: ["Criar métodos", "Definir parâmetros", "Localizar a linha do erro"] },
  { explanation: "Strings representam texto, arrays têm tamanho fixo e List cresce conforme necessário. LINQ ajuda a filtrar, ordenar e resumir coleções.", example: "var pares = numeros.Where(x => x % 2 == 0).ToList();", checklist: ["Percorrer coleções", "Usar List", "Filtrar com LINQ"] },
  { explanation: "Classes agrupam dados e comportamentos. Construtores garantem um estado inicial e exceções tratam situações inesperadas.", example: "class Conta { public double Saldo { get; private set; } }", checklist: ["Criar classes e objetos", "Proteger propriedades", "Tratar exceções"] },
];
const detailedLessons = [
  { explanation: "Todo programa começa com uma sequência de instruções. Console.WriteLine envia texto para a tela; Console.ReadLine sempre devolve texto, mesmo quando o usuário digita um número. Por isso, leia a entrada, converta quando necessário e só depois faça o cálculo. Pense em entrada, processamento e saída.", example: "var nome = Console.ReadLine()!;\nConsole.WriteLine($\"Ola, {nome}!\");", checklist: ["Separar entrada, processamento e saída", "Diferenciar texto de número", "Ler e corrigir o primeiro erro do compilador"], mistakes: "Confundir Console.ReadLine com um número e esquecer que o programa executa de cima para baixo." },
  { explanation: "Variáveis são nomes para valores que mudam ou permanecem durante o programa. int representa inteiros, double representa decimais, bool representa verdadeiro/falso e string representa texto. O compilador usa os tipos para evitar operações incoerentes. Use var quando o tipo continuar evidente e nomes que expliquem o dado.", example: "var idade = int.Parse(Console.ReadLine()!);\ndouble altura = 1.75;\nConsole.WriteLine(idade + 1);", checklist: ["Escolher um tipo adequado", "Converter entradas com int.Parse ou double.Parse", "Usar +, -, *, / e % corretamente"], mistakes: "Divisão inteira, conversão de texto inválido e nomes de variáveis que não explicam seu conteúdo." },
  { explanation: "Um programa útil toma decisões e repete tarefas. Comparações produzem bool; if/else escolhe entre caminhos e switch organiza várias opções. for é ideal quando você conhece a quantidade de repetições; while é melhor quando a repetição depende de uma condição. Teste também valores-limite, como zero, negativo e vazio.", example: "if (nota >= 6) Console.WriteLine(\"Aprovado\");\nfor (var i = 1; i <= 3; i++) Console.WriteLine(i);", checklist: ["Escrever condições verdadeiras e falsas", "Escolher entre if, switch, for e while", "Testar limites e evitar laços infinitos"], mistakes: "Usar = em vez de ==, esquecer de atualizar o contador e tratar apenas o caso feliz." },
  { explanation: "Métodos transformam um problema grande em pequenas responsabilidades. Um método deve ter um nome claro, receber apenas os dados de que precisa e retornar um resultado previsível. Ao depurar, leia a mensagem, localize arquivo/linha, reproduza o erro com uma entrada pequena e corrija uma hipótese por vez.", example: "static int Dobro(int valor) => valor * 2;\nConsole.WriteLine(Dobro(4));", checklist: ["Separar responsabilidades em métodos", "Definir parâmetros e retorno", "Reproduzir o erro antes de alterar o código"], mistakes: "Métodos que fazem coisas demais, retorno ausente e corrigir a mensagem sem entender a causa." },
  { explanation: "Coleções permitem trabalhar com muitos valores. Array tem tamanho fixo; List<T> cresce e oferece Add/Remove; Dictionary<TKey,TValue> relaciona uma chave a um valor. LINQ cria consultas legíveis para filtrar, ordenar e agregar, mas a consulta só deve ficar complexa quando realmente reduz a confusão.", example: "var pares = numeros.Where(x => x % 2 == 0).ToList();\nvar ordem = nomes.OrderBy(nome => nome);", checklist: ["Escolher array, List ou Dictionary", "Percorrer e filtrar dados", "Conferir coleção vazia e duplicatas"], mistakes: "Acessar índice inexistente, modificar coleção durante foreach e esquecer ToList quando precisa materializar o resultado." },
  { explanation: "Orientação a objetos organiza um domínio em classes. A classe descreve dados e comportamentos; o objeto é uma instância concreta. Construtores garantem estado inicial e propriedades privadas protegem regras. Exceções representam situações que não podem ser ignoradas: trate apenas o que sabe explicar e mostre uma alternativa ao usuário.", example: "class Conta { public double Saldo { get; private set; } public void Depositar(double valor) { if (valor > 0) Saldo += valor; } }", checklist: ["Modelar classes com responsabilidade clara", "Proteger estado com propriedades", "Tratar entradas inválidas e exceções"], mistakes: "Classes que guardam tudo público, construtores que deixam estado inválido e catch vazio que esconde problemas." },
];
const topics = [
  ["Console.WriteLine", "Escreva uma mensagem no console.", "Console.WriteLine(\"Ola, C#!\");", "Ola, C#!"],
  ["Entrada de dados", "Leia um nome e cumprimente a pessoa.", "var nome = Console.ReadLine();\nConsole.WriteLine($\"Olá, {nome}!\");", "Olá, Ana!"],
  ["Conversão", "Leia um número e mostre o dobro.", "var n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(n * 2);", "10"],
  ["Primeiro desafio", "Leia dois números e mostre a soma.", "var a = int.Parse(Console.ReadLine()!);\nvar b = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(a + b);", "7"],
  ["Tipos numéricos", "Calcule a área de um retângulo.", "var largura = double.Parse(Console.ReadLine()!);\nvar altura = double.Parse(Console.ReadLine()!);\nConsole.WriteLine(largura * altura);", "12"],
  ["Operadores", "Converta graus Celsius para Fahrenheit.", "var c = double.Parse(Console.ReadLine()!);\nConsole.WriteLine(c * 9 / 5 + 32);", "68"],
  ["Booleanos", "Diga se um número é positivo.", "var n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(n > 0 ? \"Sim\" : \"Não\");", "Sim"],
  ["Projeto: calculadora", "Leia dois números e uma operação (+ ou -) e mostre o resultado.", "var a = int.Parse(Console.ReadLine()!);\nvar b = int.Parse(Console.ReadLine()!);\nvar op = Console.ReadLine();\nConsole.WriteLine(op == \"+\" ? a + b : a - b);", "5"],
  ["If e else", "Classifique uma nota: aprovado se maior ou igual a 6.", "var n = double.Parse(Console.ReadLine()!);\nConsole.WriteLine(n >= 6 ? \"Aprovado\" : \"Reprovado\");", "Aprovado"],
  ["Switch", "Converta o número do mês em seu nome.", "var mes = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(mes == 1 ? \"Janeiro\" : \"Outro\");", "Janeiro"],
  ["For", "Mostre os números de 1 até N.", "var n = int.Parse(Console.ReadLine()!);\nfor (var i = 1; i <= n; i++) Console.WriteLine(i);", "1\n2\n3"],
  ["While", "Conte regressivamente até zero.", "var n = int.Parse(Console.ReadLine()!);\nwhile (n >= 0) { Console.WriteLine(n); n--; }", "2\n1\n0"],
  ["Foreach", "Some os valores de uma lista separados por vírgula.", "var valores = Console.ReadLine()!.Split(',');\nvar soma = 0;\nforeach (var valor in valores) soma += int.Parse(valor);\nConsole.WriteLine(soma);", "6"],
  ["Projeto: laços", "Leia N e mostre a tabuada de 1 a 10.", "var n = int.Parse(Console.ReadLine()!);\nfor (var i = 1; i <= 10; i++) Console.WriteLine(n * i);", "10\n20"],
  ["Parâmetros", "Crie uma função que retorne o maior de dois números.", "static int Maior(int a, int b) => a > b ? a : b;\nvar x = int.Parse(Console.ReadLine()!);\nvar y = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(Maior(x, y));", "9"],
  ["Retorno", "Crie uma função que calcule o fatorial.", "static int Fatorial(int n) => n <= 1 ? 1 : n * Fatorial(n - 1);\nConsole.WriteLine(Fatorial(int.Parse(Console.ReadLine()!)));", "120"],
  ["Depuração", "Corrija o programa para imprimir a média de três notas.", "var a = double.Parse(Console.ReadLine()!);\nvar b = double.Parse(Console.ReadLine()!);\nvar c = double.Parse(Console.ReadLine()!);\nConsole.WriteLine((a + b + c) / 3);", "6"],
  ["Projeto: notas", "Leia três notas e mostre a média formatada com duas casas.", "var a = double.Parse(Console.ReadLine()!);\nvar b = double.Parse(Console.ReadLine()!);\nvar c = double.Parse(Console.ReadLine()!);\nConsole.WriteLine($\"{(a + b + c) / 3:F2}\");", "7.00"],
  ["Strings", "Conte os caracteres de uma palavra.", "Console.WriteLine(Console.ReadLine()!.Length);", "5"],
  ["Arrays", "Leia números e mostre o maior.", "var itens = Console.ReadLine()!.Split(' ');\nConsole.WriteLine(itens.Select(int.Parse).Max());", "9"],
  ["List", "Remova duplicatas de nomes e mostre a quantidade.", "var nomes = Console.ReadLine()!.Split(',').Distinct().ToList();\nConsole.WriteLine(nomes.Count);", "2"],
  ["LINQ", "Some apenas números pares.", "var itens = Console.ReadLine()!.Split(' ').Select(int.Parse);\nConsole.WriteLine(itens.Where(x => x % 2 == 0).Sum());", "6"],
  ["Projeto: coleções", "Leia itens separados por vírgula e mostre-os em ordem alfabética.", "var itens = Console.ReadLine()!.Split(',').OrderBy(x => x);\nforeach (var item in itens) Console.WriteLine(item);", "ana\nbia"],
  ["Classes", "Crie uma classe Pessoa com nome e uma saudação.", "class Pessoa { public string Nome { get; set; } = \"\"; public string Saudacao() => $\"Ola, {Nome}!\"; }\nvar pessoa = new Pessoa { Nome = Console.ReadLine()! };\nConsole.WriteLine(pessoa.Saudacao());", "Ola, Ana!"],
  ["Construtores", "Crie uma classe Produto com nome e preço.", "class Produto { public string Nome { get; } public double Preco { get; } public Produto(string nome, double preco) { Nome = nome; Preco = preco; } }\nvar p = new Produto(Console.ReadLine()!, double.Parse(Console.ReadLine()!));\nConsole.WriteLine($\"{p.Nome}: {p.Preco:F2}\");", "Café: 5.00"],
  ["Exceções", "Trate uma divisão por zero exibindo 'Erro'.", "try { var a = int.Parse(Console.ReadLine()!); var b = int.Parse(Console.ReadLine()!); Console.WriteLine(a / b); } catch (DivideByZeroException) { Console.WriteLine(\"Erro\"); }", "Erro"],
  ["Projeto: biblioteca", "Modele um livro e mostre seu título e autor.", "class Livro { public string Titulo { get; set; } = \"\"; public string Autor { get; set; } = \"\"; }\nvar livro = new Livro { Titulo = Console.ReadLine()!, Autor = Console.ReadLine()! };\nConsole.WriteLine($\"{livro.Titulo} - {livro.Autor}\");", "C# - Microsoft"],
];
const challengeInputs = ["", "Ana", "5", "3\n4", "3\n4", "20", "5", "2\n3\n+", "7", "1", "3", "2", "1,2,3", "2", "3\n6", "5", "5", "5\n6\n7", "5\n6\n7", "casa", "1 9 3", "ana,ana,bia", "1 2 3 4", "ana,bia", "Ana", "Café\n5", "10\n0", "C#\nMicrosoft"];
const catalog = topics.map(([title, objective, starter, expected], index) => ({
  id: `csharp-${String(index + 1).padStart(2, "0")}`,
  moduleId: `module-${Math.min(Math.floor(index / 4) + 1, 6)}`,
  moduleTitle: moduleNames[Math.min(Math.floor(index / 4), 5)],
  order: index + 1,
  title,
  objective,
  theory: `Aprenda ${title.toLowerCase()} praticando. Leia o enunciado, experimente e entregue uma solução funcionando.`,
  estimatedMinutes: index % 4 === 3 ? 75 : 45,
  lesson: moduleLessons[Math.min(Math.floor(index / 4), 5)],
  isProject: title.startsWith("Projeto"),
  projectSteps: title.startsWith("Projeto") ? ["Planeje entradas e saídas", "Divida a solução em partes", "Teste com mais de um exemplo", "Revise antes de entregar"] : [],
  starterFiles: { "Program.cs": starter },
  publicExamples: [{ input: challengeInputs[index], expectedOutput: expected }],
  tests: [{ name: "Exemplo", input: challengeInputs[index], expectedOutput: expected }],
  hints: ["Identifique os dados de entrada.", "Faça uma pequena parte e execute.", "Compare sua saída com o exemplo e corrija um detalhe por vez."],
}));
catalog.forEach((challenge) => {
  const lesson = detailedLessons[Math.min(Math.floor((challenge.order - 1) / 4), 5)];
  challenge.theory = `${lesson.explanation}\n\nExemplo:\n${lesson.example}\n\nChecklist: ${lesson.checklist.join(" · ")}\n\nErro comum: ${lesson.mistakes}`;
  if (challenge.isProject) challenge.objective += " Etapas: planeje entradas e saídas; divida em partes; teste exemplos diferentes; revise antes de entregar.";
});
const modules = moduleNames.map((title, i) => ({ id: `module-${i + 1}`, title, challengeIds: catalog.filter((c) => c.moduleId === `module-${i + 1}`).map((c) => c.id) }));

function publicCatalog() { return { modules, challenges: catalog.map(({ tests, ...challenge }) => challenge) }; }
function findDotnet() { try { const version = execFileSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true }).trim(); const major = Number(version.split(".")[0]); return major >= 8 ? { available: true, version, major } : { available: false, version, reason: "SDK 8 ou superior necessário" }; } catch { return { available: false, version: null, reason: ".NET SDK não encontrado" }; } }
function normalize(value) { return String(value ?? "").replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim(); }
function safeFiles(files) { const entries = Object.entries(files || {}); if (!entries.length || entries.length > 12) throw new Error("Limite de arquivos excedido."); const total = entries.reduce((n, [name, value]) => { if (!/^[A-Za-z0-9_.-]+\.cs$/i.test(name) || name.includes("..")) throw new Error("Nome de arquivo inválido."); return n + String(value || "").length; }, 0); if (total > 100 * 1024) throw new Error("Limite de código excedido."); return entries; }
const running = new Map();
let activeExecutionDir = null;
function workspaceRoot(app) { const root = path.join(app.getPath("userData"), "code-lab", "workspaces"); fs.mkdirSync(root, { recursive: true }); return root; }
function loadWorkspace(app, challengeId) { const challenge = catalog.find((c) => c.id === challengeId); if (!challenge) throw new Error("Desafio não encontrado."); const dir = path.join(workspaceRoot(app), challengeId); fs.mkdirSync(dir, { recursive: true }); const files = {}; for (const [name, starter] of Object.entries(challenge.starterFiles)) { const file = path.join(dir, name); if (!fs.existsSync(file)) fs.writeFileSync(file, starter, "utf8"); files[name] = fs.readFileSync(file, "utf8"); } for (const name of fs.readdirSync(dir)) if (/\.cs$/i.test(name) && !files[name]) files[name] = fs.readFileSync(path.join(dir, name), "utf8"); return files; }
function saveWorkspace(app, challengeId, files) { const dir = path.join(workspaceRoot(app), challengeId); fs.mkdirSync(dir, { recursive: true }); for (const [name, content] of safeFiles(files)) fs.writeFileSync(path.join(dir, name), String(content || ""), "utf8"); return loadWorkspace(app, challengeId); }
function runProcess(command, args, input, timeout, requestId, cwd) { return new Promise((resolve) => { const absolute = args.find((arg) => typeof arg === "string" && path.isAbsolute(arg)); const tempDirs = !absolute && args.includes("CodeLab.csproj") ? fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("studyhub-csharp-")).sort() : []; const inferredCwd = cwd || activeExecutionDir || (absolute ? path.dirname(absolute) : tempDirs.length ? path.join(os.tmpdir(), tempDirs[tempDirs.length - 1]) : undefined); const child = spawn(command, args, { windowsHide: true, shell: false, cwd: inferredCwd }); running.set(requestId, child); let stdout = "", stderr = "", killed = false; const cap = (current, next) => (current + next).slice(0, 65536); child.stdout.on("data", (d) => { stdout = cap(stdout, d.toString()); }); child.stderr.on("data", (d) => { stderr = cap(stderr, d.toString()); }); if (input) child.stdin.write(input); child.stdin.end(); const timer = setTimeout(() => { killed = true; child.kill(); }, timeout); child.on("close", (code) => { clearTimeout(timer); running.delete(requestId); resolve({ code, stdout, stderr, timedOut: killed }); }); }); }
async function execute({ app, challengeId, files, mode, input, requestId }) { const env = findDotnet(); if (!env.available) return { status: "runtime_error", message: env.reason }; const challenge = catalog.find((c) => c.id === challengeId); if (!challenge) return { status: "runtime_error", message: "Desafio não encontrado." }; const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studyhub-csharp-")); try { for (const [name, content] of safeFiles(files)) fs.writeFileSync(path.join(dir, name), content, "utf8"); fs.writeFileSync(path.join(dir, "CodeLab.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${env.major}.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>`, "utf8"); const build = await runProcess("dotnet", ["build", "CodeLab.csproj", "--nologo", "-v", "q"], "", 20000, `${requestId}-build`); if (build.timedOut) return { status: "timeout", stderr: "Compilação excedeu o tempo limite." }; if (build.code !== 0) return { status: "compile_error", stderr: build.stderr, stdout: build.stdout, diagnostics: parseDiagnostics(build.stderr) }; const dll = path.join(dir, "bin", "Debug", `net${env.major}.0`, "CodeLab.dll"); if (mode === "run") { const result = await runProcess("dotnet", [dll], input || "", 5000, requestId); return result.timedOut ? { status: "timeout", ...result } : { status: result.code === 0 ? "passed" : "runtime_error", ...result }; } const tests = challenge.tests || []; const results = []; for (const test of tests) { const result = await runProcess("dotnet", [dll], test.input || "", 5000, `${requestId}-${test.name}`); const passed = !result.timedOut && result.code === 0 && normalize(result.stdout) === normalize(test.expectedOutput); results.push({ name: test.name, passed, expected: test.expectedOutput, actual: result.stdout, stderr: result.stderr }); if (!passed) return { status: result.timedOut ? "timeout" : "failed", tests: results, stderr: result.stderr, stdout: result.stdout }; } return { status: "passed", tests: results }; } catch (error) { return { status: "runtime_error", message: error.message }; } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
function parseDiagnostics(stderr) { return String(stderr || "").split(/\r?\n/).map((line) => { const match = line.match(/(.+?)\((\d+),(\d+)\): error (CS\d+): (.+)/); if (!match) return null; const map = { CS1002: "Está faltando um ponto e vírgula.", CS0103: "Esse nome ainda não foi declarado.", CS0029: "Os tipos não podem ser convertidos dessa forma.", CS0246: "Tipo ou namespace não encontrado.", CS1513: "Está faltando uma chave de fechamento." }; return { file: path.basename(match[1]), line: Number(match[2]), column: Number(match[3]), code: match[4], message: match[5], explanation: map[match[4]] || "Revise a mensagem do compilador e a linha indicada." }; }).filter(Boolean); }
function registerCodeLabIpc({ ipcMain, app, authorizeSender }) {
  const register = (channel, handler) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (typeof authorizeSender === "function" && !authorizeSender(event)) {
        throw new Error("Janela não autorizada.");
      }
      return handler(event, ...args);
    });

  register("csharp:environment", () => findDotnet());
  register("csharp:catalog", () => publicCatalog());
  register("csharp:workspace:load", (_event, id) => loadWorkspace(app, id));
  register("csharp:workspace:save", (_event, payload = {}) =>
    saveWorkspace(app, payload.challengeId, payload.files),
  );
  register("csharp:run", (_event, payload = {}) =>
    execute({ app, ...payload, mode: "run" }),
  );
  register("csharp:submit", (_event, payload = {}) =>
    execute({ app, ...payload, mode: "submit" }),
  );
  register("csharp:cancel", (_event, id) => {
    const child = running.get(id);
    if (child) child.kill();
    return Boolean(child);
  });
  register("ollama:status", () => getOllamaStatus());
  register("ollama:start", () => startOllama());
  register("ollama:chat", async (_event, payload = {}) => {
    const messages = (Array.isArray(payload.messages) ? payload.messages : [])
      .slice(-20)
      .map((message) => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: String(message?.content || "").slice(0, 20_000),
      }));
    try {
      const data = await chatWithOllama({
        model: String(payload.model || "").slice(0, 120),
        messages,
      });
      return { available: true, message: data.message, model: data.model };
    } catch (error) {
      return { available: false, message: error.message };
    }
  });
}
module.exports = { catalog, modules, publicCatalog, registerCodeLabIpc, parseDiagnostics, normalize, execute, findDotnet, loadWorkspace, saveWorkspace };
