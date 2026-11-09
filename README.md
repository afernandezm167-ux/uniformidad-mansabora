# Uniformidad

Aplicación web para gestionar el stock de uniformidad (camisetas, sudaderas y pañoletas), lo que se entrega a cada persona y los pedidos de camisas por niño.

## Funciones

- **Inventario**: existencias por talla (6 a 2XL) de camisetas y sudaderas, y pañoletas pequeñas/grandes. Avisa del stock bajo (menos de 3) y de lo agotado.
- **Personas**: entregas por persona, con control de pago y de entrega. Se puede apuntar algo "por entregar" cuando no hay stock y darlo más tarde. Al quitar una entrega, se devuelve al stock.
- **Camisas**: pedidos por niño (talla, sección, método de pago), sin stock. Marca de pagado/entregado y hasta 3 insignias por niño: la 2ª requiere la 1ª y la 3ª requiere la 2ª.
- **Exportar**: Excel (`.xlsx`), Google Sheets y copia de seguridad en JSON (descargar/restaurar).
- Los datos se sincronizan entre dispositivos conectados al mismo servidor (cada 5 segundos).

## Requisitos

- [Node.js](https://nodejs.org) 22.5 o superior (usa el módulo SQLite incluido, no hay que instalar dependencias).

## Uso

```
node server.js
```

Abre http://localhost:3000. Al arrancar, la consola también muestra la dirección para entrar desde el móvil (misma red wifi).

Los datos se guardan en `uniformidad.db` (SQLite, junto al proyecto). Si existe un `data.json` de una versión anterior, se importa la primera vez.

> `uniformidad.db` y `data.json` contienen datos personales y están en `.gitignore`: no se suben al repositorio.

## Google Sheets

1. Crea una hoja de cálculo en Google Sheets.
2. `Extensiones > Apps Script`, pega el contenido de `google-sheets.gs` y guarda.
3. `Implementar > Nueva implementación`: tipo *Aplicación web*, ejecutar como *Yo*, acceso *Cualquier usuario*.
4. Copia la URL y pégala al pulsar **Enviar a Google Sheets** en la aplicación.

Cada envío sustituye el contenido de las hojas Stock, Entregas, Personas y Camisas.

## Estructura

| Archivo | Descripción |
| --- | --- |
| `server.js` | Servidor HTTP y API (`/api/datos`) sobre SQLite |
| `index.html`, `app.js`, `style.css` | Interfaz |
| `google-sheets.gs` | Script de Google para recibir los datos |
