# Integracion Evolution API -> n8n

Este proyecto levanta una integracion local entre Evolution API y n8n usando Docker Compose.

## 1) Que activar en n8n

1. Crear un workflow con estos nodos:
   - Webhook (POST)
   - Respond to Webhook
2. Configurar el nodo Webhook:
   - Method: POST
   - Path: evolution-inbox
   - Respond: Using Respond to Webhook Node
3. Configurar el nodo Respond to Webhook:
   - Response Code: 200
   - Body JSON:

```json
{
  "ok": true,
  "msg": "recibido en n8n"
}
```

4. Publicar/activar el workflow (toggle Active).

## 2) Que colocar en Evolution API

Configurar el webhook de la instancia para usar la URL interna de Docker de n8n:

- URL recomendada (produccion):
  - http://n8n:5678/webhook/evolution-inbox

Notas importantes:
- No usar localhost dentro de Evolution API para apuntar a n8n.
- Usar byEvents=false para enviar todos los eventos al mismo endpoint.

### Ejemplo de configuracion por API

Instancia usada en este entorno: raul-ws

```powershell
$headers = @{ apikey = "TU_API_KEY" }
$body = @{
  webhook = @{
    enabled  = $true
    url      = "http://n8n:5678/webhook/evolution-inbox"
    byEvents = $false
    base64   = $false
    events   = @("MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE","CONNECTION_UPDATE")
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post -Uri "http://localhost:8080/webhook/set/raul-ws" -Headers $headers -ContentType "application/json" -Body $body
```

Verificar configuracion:

```powershell
$headers = @{ apikey = "TU_API_KEY" }
Invoke-RestMethod -Method Get -Uri "http://localhost:8080/webhook/find/raul-ws" -Headers $headers | ConvertTo-Json -Depth 10
```

## 3) Prueba rapida

1. Enviar un mensaje de WhatsApp a la instancia conectada.
2. Revisar en n8n -> Executions.
3. Confirmar que llega un evento messages.upsert.

Ejemplo de texto recibido:
- body.data.message.conversation

## 4) Diferencia entre webhook-test y webhook

- webhook-test:
  - Solo funciona cuando el nodo esta en Listen for test event.
- webhook:
  - Funciona con el workflow activo/publicado.

Para produccion local, usar siempre /webhook/...

## 5) Importante para evitar bloqueos en Evolution API

Para reducir riesgo de bloqueos o comportamiento no deseado, seguir siempre este flujo de atencion:

1. Iniciar la conversacion (no responder en frio sin contexto).
2. Leer la conversacion antes de continuar (validar ultimo mensaje y estado).
3. Cerrar la conversacion al finalizar la atencion.

En resumen: iniciar, leer y cerrar la conversacion es obligatorio en la operacion diaria.

## 6) Guia anti-bloqueos (recomendado)

Basado en politicas oficiales de WhatsApp/Meta y buenas practicas operativas.

### Consentimiento (opt-in) y bajas (opt-out)

1. Enviar mensajes solo a usuarios con consentimiento previo verificable.
2. Guardar evidencia del opt-in (fecha, canal y texto aceptado).
3. Explicar claramente que tipo de mensajes recibira el usuario (soporte, alertas, promociones).
4. Ofrecer salida clara (STOP/BAJA) y respetarla inmediatamente.

### Calidad y riesgo de limitaciones

1. Evitar envios masivos en frio o mensajes no solicitados.
2. Priorizar conversaciones iniciadas por el usuario.
3. Mantener una frecuencia moderada y contextual.
4. Monitorear bloqueos/reportes y pausar envios si aumenta el rechazo.

### Politica de contenido

1. No enviar contenido engañoso, fraudulento, suplantacion o spam.
2. No usar WhatsApp para categorias prohibidas o restringidas sin cumplir requisitos.
3. Mantener perfil de negocio real, claro y actualizado.

### Operacion diaria sugerida

1. Verificar opt-in antes de cada envio.
2. Validar estado de la conversacion (iniciar, leer, responder, cerrar).
3. Registrar evento, resultado y errores para auditoria.
4. Si hay picos de rechazo, bajar volumen y revisar copy/segmentacion.

### Nota para futuro cambio a Meta Cloud API

1. Fuera de la ventana de 24 horas, usar plantillas aprobadas.
2. Mantener la logica de normalizacion en n8n para cambiar de proveedor sin rehacer flujos.
