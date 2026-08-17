from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "qa-guided-reading.pdf"


def draw_page(pdf, page_number, title, eyebrow, paragraphs):
    width, height = A4
    purple = HexColor("#7C3AED")
    ink = HexColor("#232231")
    muted = HexColor("#6E6A7C")
    soft = HexColor("#F4F1FF")

    pdf.setFillColor(soft)
    pdf.roundRect(46, height - 104, width - 92, 48, 14, fill=1, stroke=0)
    pdf.setFillColor(purple)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(66, height - 76, eyebrow.upper())

    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(54, height - 144, title)
    pdf.setFillColor(muted)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(54, height - 164, "Leitura guiada com narração sincronizada")

    y = height - 215
    for heading, lines in paragraphs:
        pdf.setFillColor(purple)
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(54, y, heading)
        y -= 26
        pdf.setFillColor(ink)
        pdf.setFont("Helvetica", 11)
        for line in lines:
            pdf.drawString(62, y, line)
            y -= 19
        y -= 15

    pdf.setStrokeColor(HexColor("#DED9EA"))
    pdf.line(54, 55, width - 54, 55)
    pdf.setFillColor(muted)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(54, 39, "STUDYHUB  •  MATERIAL DE ESTUDO")
    pdf.drawRightString(width - 54, 39, f"PÁGINA {page_number}")
    pdf.showPage()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    pdf.setTitle("Leitura guiada StudyHub")

    draw_page(
        pdf,
        1,
        "O ciclo da água",
        "Ciências naturais",
        [
            (
                "Uma viagem contínua",
                [
                    "A água circula continuamente entre os oceanos, a atmosfera e a superfície terrestre.",
                    "O calor do sol transforma parte da água líquida em vapor, iniciando a evaporação.",
                    "Ao subir e encontrar temperaturas mais baixas, o vapor se condensa em pequenas gotas.",
                    "Essas gotas se agrupam para formar nuvens e, depois, retornam ao solo como precipitação.",
                ],
            ),
            (
                "Por que isso importa?",
                [
                    "O ciclo renova as reservas de água doce usadas por plantas, animais e pessoas.",
                    "Ele também distribui calor pelo planeta e influencia o clima de cada região.",
                    "Compreender esse movimento ajuda a proteger rios, florestas e fontes subterrâneas.",
                ],
            ),
            (
                "Para lembrar",
                [
                    "Evaporação, condensação, precipitação e infiltração são etapas conectadas.",
                    "Nenhuma gota fica parada: a água muda de estado e de lugar ao longo do tempo.",
                ],
            ),
        ],
    )

    draw_page(
        pdf,
        2,
        "A água no cotidiano",
        "Aplicação prática",
        [
            (
                "Uso consciente",
                [
                    "Pequenas escolhas diárias reduzem o desperdício e preservam água de boa qualidade.",
                    "Fechar a torneira, reparar vazamentos e reutilizar água são atitudes simples e eficazes.",
                    "A proteção das nascentes começa com a conservação do solo e da vegetação ao redor.",
                ],
            ),
            (
                "Desafio de estudo",
                [
                    "Ouça cada frase, acompanhe o destaque e pause para repetir com suas próprias palavras.",
                    "Ao terminar, explique o ciclo da água sem consultar o texto e revise os pontos difíceis.",
                ],
            ),
        ],
    )

    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
