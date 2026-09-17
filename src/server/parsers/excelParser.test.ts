import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseExcelZuStrukturiertemText } from './excelParser'

// Kernannahme der Spec: exceljs liest Zellfüllfarben zuverlässig über
// cell.fill.fgColor.argb aus, anders als SheetJS im Browser. Dieser Test baut
// gezielt eine Mini-Mappe mit Füllfarben und prüft den Roundtrip, unabhängig
// von der noch fehlenden Lerchenfeld-Fixture.
async function baueTestMappe(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Preisliste')

  sheet.getCell('A1').value = 'W01'
  sheet.getCell('A2').value = 'W02'
  sheet.getCell('A2').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF0000' }, // rot = verkauft
  }
  sheet.getCell('A3').value = 'W03'
  sheet.getCell('A3').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' }, // gelb = reserviert
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

describe('parseExcelZuStrukturiertemText', () => {
  it('liest Zellfüllfarben zuverlässig als Marker aus', async () => {
    const buffer = await baueTestMappe()
    const blaetter = await parseExcelZuStrukturiertemText(buffer)

    expect(blaetter).toHaveLength(1)
    const [blatt] = blaetter
    expect(blatt.name).toBe('Preisliste')
    expect(blatt.zeilen[0]).toBe('W01')
    expect(blatt.zeilen[1]).toBe('W02 [FARBE:FF0000]')
    expect(blatt.zeilen[2]).toBe('W03 [FARBE:FFFF00]')
  })

  it('lässt ungefärbte Zellen ohne Marker', async () => {
    const buffer = await baueTestMappe()
    const blaetter = await parseExcelZuStrukturiertemText(buffer)
    expect(blaetter[0].zeilen[0]).not.toContain('FARBE')
  })
})
