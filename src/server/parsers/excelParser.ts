import ExcelJS from 'exceljs'

export interface ExcelBlatt {
  name: string
  zeilen: string[]
}

function zellwert(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '')
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text ?? '')
  if (v instanceof Date) return v.toLocaleDateString('de-DE')
  return String(v)
}

function fuellFarbe(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill
  if (!fill || fill.type !== 'pattern') return null
  const fg = fill.fgColor
  if (!fg?.argb) return null
  // argb: "FFRRGGBB" — die ersten beiden Hex-Ziffern (Alpha) interessieren
  // uns nicht, nur die eigentliche Farbe.
  return fg.argb.slice(2)
}

export async function parseExcelZuStrukturiertemText(buffer: Buffer): Promise<ExcelBlatt[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const blaetter: ExcelBlatt[] = []

  workbook.eachSheet((sheet) => {
    const zeilen: string[] = []

    sheet.eachRow((row) => {
      const zellen: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = zellwert(cell)
        if (text === '') return
        const farbe = fuellFarbe(cell)
        zellen.push(farbe ? `${text} [FARBE:${farbe}]` : text)
      })
      if (zellen.length > 0) zeilen.push(zellen.join(' | '))
    })

    blaetter.push({ name: sheet.name, zeilen })
  })

  return blaetter
}
