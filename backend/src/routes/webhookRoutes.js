const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { webhookLimiter } = require('../middlewares/rateLimitMiddleware');

// Rota para documentação dos webhooks (página estática)
router.get('/documentation', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Documentação de Webhooks - ZapStorm</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #075e54; }
          h2 { color: #128c7e; margin-top: 30px; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f2f2f2; }
          tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <h1>Documentação de Webhooks - ZapStorm</h1>
        
        <p>Esta página documenta como configurar e receber webhooks do sistema ZapStorm para integração com outros sistemas.</p>
        
        <h2>Configuração de Webhook</h2>
        
        <p>Para configurar um webhook para uma instância, acesse a interface do ZapStorm e vá para a página de Instâncias. Selecione a instância desejada e clique na aba "Webhook".</p>
        
        <p>Você precisará fornecer:</p>
        <ul>
          <li><strong>URL do Webhook</strong>: URL completa para onde os eventos serão enviados</li>
          <li><strong>Eventos</strong>: Selecione quais eventos deseja receber</li>
        </ul>
        
        <h2>Eventos Disponíveis</h2>
        
        <table>
          <tr>
            <th>Evento</th>
            <th>Descrição</th>
          </tr>
          <tr>
            <td>QRCODE_UPDATED</td>
            <td>Quando um novo QR code é gerado para conexão</td>
          </tr>
          <tr>
            <td>CONNECTION_UPDATE</td>
            <td>Mudanças no status de conexão da instância</td>
          </tr>
          <tr>
            <td>MESSAGES_UPSERT</td>
            <td>Quando uma nova mensagem é recebida ou enviada</td>
          </tr>
          <tr>
            <td>MESSAGES_UPDATE</td>
            <td>Quando há atualizações no status de uma mensagem (entregue, lida)</td>
          </tr>
          <tr>
            <td>MESSAGES_DELETE</td>
            <td>Quando uma mensagem é deletada</td>
          </tr>
          <tr>
            <td>SEND_MESSAGE</td>
            <td>Quando uma mensagem é enviada através da API</td>
          </tr>
        </table>
        
        <h2>Formato de Payload</h2>
        
        <p>O formato do payload segue o padrão da Evolution API. Abaixo estão exemplos de payloads para diferentes eventos:</p>
        
        <h3>Evento: CONNECTION_UPDATE</h3>
        <pre>
{
  "event_type": "CONNECTION_UPDATE",
  "instance": "instance-name",
  "data": {
    "state": "open",
    "info": {}
  }
}
        </pre>
        
        <h3>Evento: MESSAGES_UPSERT</h3>
        <pre>
{
  "event_type": "MESSAGES_UPSERT",
  "instance": "instance-name",
  "data": {
    "messages": [
      {
        "key": {
          "remoteJid": "5511999999999@s.whatsapp.net",
          "fromMe": true,
          "id": "3EB01A11DDCFC"
        },
        "message": {
          "conversation": "Olá! Mensagem de teste."
        },
        "messageTimestamp": 1675943718,
        "status": "PENDING"
      }
    ]
  }
}
        </pre>
        
        <h2>Teste seu Webhook</h2>
        
        <p>Para testar se seu webhook está funcionando corretamente, você pode usar a rota de teste fornecida pelo ZapStorm:</p>
        
        <code>POST /api/webhook/test</code>
        
        <p>Envie um payload com os seguintes campos:</p>
        <pre>
{
  "url": "https://seu-webhook-url.com",
  "event": "teste"
}
        </pre>
        
        <p>Se seu webhook estiver configurado corretamente, você receberá uma resposta de teste.</p>
      </body>
    </html>
  `);
});

// Rota para teste de webhook (apenas para desenvolvimento)
router.post('/test', async (req, res) => {
  try {
    const { url, event } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL de webhook é obrigatória'
      });
    }
    
    // Enviar payload de teste para o webhook
    const axios = require('axios');
    const testPayload = {
      event: event || 'test',
      instanceName: 'test-instance',
      timestamp: new Date().toISOString(),
      message: 'Este é um payload de teste para verificar a configuração do webhook'
    };
    
    const response = await axios.post(url, testPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 segundos de timeout
    });
    
    res.status(200).json({
      success: true,
      message: 'Teste de webhook enviado com sucesso',
      response: {
        status: response.status,
        data: response.data
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao testar webhook',
      error: error.message
    });
  }
});

// Rota para receber webhooks da API Evolution
// Não usamos middleware de autenticação aqui, pois o webhook é chamado pelo sistema externo
router.post('/:instanceName', webhookLimiter, webhookController.processWebhook);

module.exports = router; 