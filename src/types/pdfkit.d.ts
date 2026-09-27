/**
 * Le sous-ensemble de pdfkit dont l'attestation de signature a besoin — rien de
 * plus. Le paquet ne publie pas ses types ; déclarer seulement ce qu'on appelle
 * fait échouer la compilation le jour où on appelle autre chose sans le typer.
 */
declare module 'pdfkit' {
  type Options = {
    size?: string
    margin?: number
    info?: Record<string, string | Date>
    lang?: string
    displayTitle?: boolean
    tagged?: boolean
    bufferPages?: boolean
    autoFirstPage?: boolean
  }
  type Texte = {
    align?: 'left' | 'center' | 'right' | 'justify'
    width?: number
    continued?: boolean
    lineGap?: number
    paragraphGap?: number
    underline?: boolean
    link?: string
    indent?: number
    lineBreak?: boolean
  }

  class PDFDocument {
    constructor(options?: Options)
    readonly page: { readonly width: number; readonly height: number; margins: { left: number; right: number; top: number; bottom: number } }
    y: number
    x: number
    on(evenement: 'data', f: (morceau: Buffer) => void): this
    on(evenement: 'end', f: () => void): this
    on(evenement: 'error', f: (e: Error) => void): this
    font(nom: string): this
    fontSize(taille: number): this
    fillColor(couleur: string): this
    strokeColor(couleur: string): this
    lineWidth(largeur: number): this
    text(texte: string, options?: Texte): this
    text(texte: string, x: number, y: number, options?: Texte): this
    moveDown(lignes?: number): this
    moveTo(x: number, y: number): this
    lineTo(x: number, y: number): this
    rect(x: number, y: number, l: number, h: number): this
    stroke(): this
    image(source: Buffer, options?: { fit?: [number, number]; width?: number }): this
    image(source: Buffer, x: number, y: number, options?: { fit?: [number, number]; width?: number }): this
    heightOfString(texte: string, options?: Texte): number
    addPage(): this
    switchToPage(n: number): this
    bufferedPageRange(): { start: number; count: number }
    flushPages(): void
    end(): void
  }

  export default PDFDocument
}
