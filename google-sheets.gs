// Script de Google para recibir los datos de Uniformidad en una hoja de cálculo.
//
// Cómo ponerlo en marcha (una sola vez):
//  1. Crea una hoja de cálculo nueva en https://sheets.google.com
//  2. Menú  Extensiones > Apps Script
//  3. Borra lo que haya, pega todo este archivo y pulsa el icono de guardar
//  4. Pulsa  Implementar > Nueva implementación
//       - Tipo: Aplicación web
//       - Ejecutar como: Yo
//       - Quién tiene acceso: Cualquier usuario
//  5. Autoriza los permisos que pida Google y copia la "URL de la aplicación web"
//  6. En Uniformidad, pulsa "Enviar a Google Sheets" y pega esa URL
//
// Cada envío sustituye el contenido de las hojas Stock, Entregas y Personas.

function doPost(e) {
  const datos = JSON.parse(e.postData.contents);
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(datos).forEach(function (nombre) {
    const filas = datos[nombre];
    const hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    hoja.clearContents();
    hoja.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
    hoja.getRange(1, 1, 1, filas[0].length).setFontWeight('bold').setBackground('#eef0ff');
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, filas[0].length);
  });

  // Quita la hoja vacía que Google crea por defecto
  const porDefecto = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (porDefecto && libro.getSheets().length > 1) libro.deleteSheet(porDefecto);

  return ContentService.createTextOutput('OK');
}

function doGet() {
  return ContentService.createTextOutput('Uniformidad: el script está activo');
}
