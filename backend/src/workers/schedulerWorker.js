const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');
const queueService = require('../services/queueService');

// Log de inicialização explícito para garantir que apareça no console do Docker
console.log("========================================================");
console.log("INICIALIZANDO SCHEDULER WORKER");
console.log(`Data e hora de inicialização: ${new Date().toISOString()}`);
console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
console.log(`Diretório atual: ${process.cwd()}`);
console.log("========================================================");

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Modelos
const { Campaign, Message, Contact, Template, Instance } = require('../models');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => {
    console.log('Scheduler conectado ao MongoDB');
    logger.info('Scheduler conectado ao MongoDB');
  })
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    logger.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Processar campanhas agendadas
const processScheduledCampaigns = async () => {
  const now = new Date();
  
  try {
    // Buscar campanhas agendadas que devem ser iniciadas agora
    const scheduledCampaigns = await Campaign.find({
      status: 'queued',
      'schedule.type': 'scheduled',
      'schedule.startAt': { $lte: now }
    });
    
    logger.info(`Verificando campanhas agendadas: ${scheduledCampaigns.length} campanhas encontradas`);
    
    // CORREÇÃO: Verificar campanhas já iniciadas para evitar processamento duplicado
    // Procurar mensagens criadas para esta campanha nas últimas 24 horas
    for (const campaign of scheduledCampaigns) {
      const existingMessages = await Message.find({
        campaignId: campaign._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(1);
      
      // Se não há mensagens, esta campanha ainda não foi processada
      if (existingMessages.length === 0) {
        logger.info(`Iniciando campanha não processada: ${campaign.name}, ID: ${campaign._id}`);
        await startCampaign(campaign);
      } else {
        logger.info(`Campanha ${campaign._id} já possui mensagens e não será processada novamente`);
        
        // Atualizar status da campanha para running se ainda estiver como queued
        if (campaign.status === 'queued') {
          await Campaign.findByIdAndUpdate(campaign._id, {
            status: 'running',
            lastUpdated: Date.now()
          });
          logger.info(`Status da campanha ${campaign._id} atualizado para 'running'`);
        }
      }
    }
    
    // Buscar campanhas recorrentes
    await processRecurringCampaigns();
  } catch (error) {
    logger.error('Erro ao processar campanhas agendadas:', error);
  }
};

// Verificar campanhas concluídas
const checkCompletedCampaigns = async () => {
  try {
    // Buscar campanhas em execução que podem ter sido concluídas
    const runningCampaigns = await Campaign.find({
      status: 'running',
      'metrics.pending': 0
    });
    
    logger.info(`Verificando campanhas concluídas: ${runningCampaigns.length} campanhas encontradas`);
    
    // Atualizar status para 'completed'
    for (const campaign of runningCampaigns) {
      logger.info(`Campanha ${campaign._id} concluída - todas as mensagens processadas`);
      
      await Campaign.findByIdAndUpdate(
        campaign._id,
        {
          status: 'completed',
          lastUpdated: Date.now()
        }
      );
      
      // Publicar evento de conclusão da campanha
      await queueService.publishEvent({
        type: 'campaign_completed',
        data: {
          campaignId: campaign._id,
          campaignName: campaign.name,
          metrics: campaign.metrics
        }
      });
    }
    
    // Verificar também campanhas com falha total
    const failedCampaigns = await Campaign.find({
      status: 'running',
      'metrics.pending': 0,
      'metrics.failed': { $gt: 0 },
      'metrics.sent': 0
    });
    
    for (const campaign of failedCampaigns) {
      logger.info(`Campanha ${campaign._id} falhou - todas as mensagens resultaram em erro`);
      
      await Campaign.findByIdAndUpdate(
        campaign._id,
        {
          status: 'failed',
          lastUpdated: Date.now()
        }
      );
      
      // Publicar evento de falha da campanha
      await queueService.publishEvent({
        type: 'campaign_failed',
        data: {
          campaignId: campaign._id,
          campaignName: campaign.name,
          metrics: campaign.metrics
        }
      });
    }
  } catch (error) {
    logger.error('Erro ao verificar campanhas concluídas:', error);
  }
};

// Processar campanhas recorrentes
const processRecurringCampaigns = async () => {
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 (Domingo) a 6 (Sábado)
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  logger.info(`=== VERIFICANDO CAMPANHAS RECORRENTES ===`);
  logger.info(`Data e hora atual: ${now.toISOString()}`);
  logger.info(`Dia da semana: ${currentDayOfWeek}, Hora atual: ${currentTime}`);
  
  try {
    // Buscar campanhas recorrentes ativas
    const recurringCampaigns = await Campaign.find({
      status: { $in: ['draft', 'queued'] },
      'schedule.type': 'recurring'
    });
    
    logger.info(`Encontradas ${recurringCampaigns.length} campanhas recorrentes para verificar`);
    
    for (const campaign of recurringCampaigns) {
      logger.info(`\nAnalisando campanha: "${campaign.name}" (ID: ${campaign._id})`);
      logger.info(`Padrão de recorrência: ${campaign.schedule.recurrencePattern}, Hora: ${campaign.schedule.recorrenceTime || '09:00'}`);
      
      // Verificar se é dia de execução
      let shouldRunToday = false;
      
      if (campaign.schedule.recurrencePattern === 'daily') {
        shouldRunToday = true;
        logger.info(`Campanha diária - deve executar todos os dias`);
      } else if (campaign.schedule.recurrencePattern === 'weekly') {
        shouldRunToday = campaign.schedule.recurrenceDays && campaign.schedule.recurrenceDays.includes(currentDayOfWeek);
        logger.info(`Campanha semanal - dias configurados: ${campaign.schedule.recurrenceDays?.join(', ')}, hoje (${currentDayOfWeek}): ${shouldRunToday ? 'SIM' : 'NÃO'}`);
      } else if (campaign.schedule.recurrencePattern === 'monthly') {
        // Verificar se é o mesmo dia do mês
        const campaignDay = campaign.schedule.startAt ? new Date(campaign.schedule.startAt).getDate() : now.getDate();
        shouldRunToday = now.getDate() === campaignDay;
        logger.info(`Campanha mensal - dia configurado: ${campaignDay}, hoje (${now.getDate()}): ${shouldRunToday ? 'SIM' : 'NÃO'}`);
      }
      
      if (!shouldRunToday) {
        logger.info(`Campanha ${campaign._id} não será executada hoje`);
        continue;
      }
      
      // Verificar se é hora de execução (com tolerância de 5 minutos)
      const targetTime = campaign.schedule.recurrenceTime || '09:00';
      const [targetHour, targetMinute] = targetTime.split(':').map(Number);
      
      logger.info(`Horário configurado: ${targetTime}, Horário atual: ${currentTime}`);
      
      // Criar objetos Date para comparação precisa
      const targetDate = new Date(now);
      targetDate.setHours(targetHour, targetMinute, 0, 0);
      
      // Calcular diferença em minutos
      const timeDiffMinutes = Math.abs(now - targetDate) / (1000 * 60);
      
      logger.info(`Diferença de tempo: ${timeDiffMinutes.toFixed(2)} minutos`);
      
      if (timeDiffMinutes > 5) {
        logger.info(`Campanha ${campaign._id} não será executada agora (fora da janela de 5 minutos)`);
        continue;
      }
      
      logger.info(`Horário correto para execução da campanha ${campaign._id}`);
      
      // Verificar se já foi executada hoje
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      logger.info(`Verificando se a campanha já foi executada hoje (após ${today.toISOString()})`);
      
      const lastRun = await Message.findOne({
        campaignId: campaign._id,
        createdAt: { $gte: today }
      });
      
      if (lastRun) {
        logger.info(`Campanha ${campaign._id} JÁ foi executada hoje (${lastRun.createdAt.toISOString()}), pulando...`);
        continue;
      }
      
      logger.info(`Campanha ${campaign._id} NÃO foi executada hoje, iniciando agora...`);
      await startCampaign(campaign);
      logger.info(`Campanha recorrente ${campaign._id} iniciada com sucesso!`);
    }
    
    logger.info(`=== VERIFICAÇÃO DE CAMPANHAS RECORRENTES CONCLUÍDA ===\n`);
  } catch (error) {
    logger.error('Erro ao processar campanhas recorrentes:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
};

// Iniciar uma campanha (criar mensagens e enfileirar)
const startCampaign = async (campaign) => {
  logger.info(`Iniciando campanha: ${campaign.name}, ID: ${campaign._id}`);
  console.log(`Iniciando campanha: ${campaign.name}, ID: ${campaign._id}, Instância ID: ${campaign.instanceId}`);
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Obter template
    const template = await Template.findById(campaign.templateId).session(session);
    if (!template) {
      logger.error(`Template não encontrado para campanha ${campaign._id}`);
      await session.abortTransaction();
      session.endSession();
      return;
    }
    
    logger.info(`Template encontrado: ${template.name}, ID: ${template._id}`);
    
    // Obter contatos
    let contacts;
    
    if (campaign.contacts && campaign.contacts.length > 0) {
      // Buscar contatos específicos
      contacts = await Contact.find({
        _id: { $in: campaign.contacts }
      }).session(session);
      
      logger.info(`Buscando ${campaign.contacts.length} contatos específicos. Encontrados: ${contacts.length}`);
    } else if (campaign.contactFilter && Object.keys(campaign.contactFilter).length > 0) {
      // Aplicar filtro
      contacts = await Contact.find(campaign.contactFilter).session(session);
      logger.info(`Buscando contatos por filtro. Encontrados: ${contacts ? contacts.length : 0}`);
    } else {
      logger.error(`Nenhum contato selecionado para campanha ${campaign._id}`);
      await session.abortTransaction();
      session.endSession();
      return;
    }
    
    if (!contacts || contacts.length === 0) {
      logger.warn(`Nenhum contato encontrado para campanha ${campaign._id}`);
      await session.abortTransaction();
      session.endSession();
      return;
    }
    
    // Verificar instância
    logger.info(`Buscando instância com ID: ${campaign.instanceId}`);
    const instance = await Instance.findById(campaign.instanceId).session(session);
    
    if (!instance) {
      logger.error(`Instância não encontrada para campanha ${campaign._id}, ID da instância: ${campaign.instanceId}`);
      await session.abortTransaction();
      session.endSession();
      return;
    }
    
    logger.info(`Instância encontrada: ${instance.instanceName}, Status: ${instance.status}`);
    
    // Verificar se a instância está conectada
    if (instance.status !== 'connected') {
      logger.error(`Instância ${instance.instanceName} não está conectada para campanha ${campaign._id}`);
      await session.abortTransaction();
      session.endSession();
      return;
    }
    
    // Criar mensagens para cada contato
    const messages = [];
    const variableValues = campaign.variableValues || {};
    
    logger.info(`Preparando ${contacts.length} mensagens para a campanha ${campaign._id}`);
    
    for (const contact of contacts) {
      // Criar conteúdo personalizado substituindo variáveis
      let content = template.content;
      
      // Substituir variáveis no template
      if (template.variables && template.variables.length > 0) {
        for (const variable of template.variables) {
          const value = variableValues[variable] || '';
          const regex = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
          content = content.replace(regex, value);
        }
      }
      
      // Substituir nome do contato se existir
      if (contact.name) {
        content = content.replace(/\{\{nome\}\}/g, contact.name);
      }
      
      // Criar mensagem
      const message = new Message({
        campaignId: campaign._id,
        contactId: contact._id,
        status: 'pending',
        content,
        mediaUrl: template.mediaUrl || null,
        mediaType: template.mediaType || 'none',
        instanceId: instance.instanceName,
        retries: 0
      });
      
      messages.push(message);
    }
    
    logger.info(`Criadas ${messages.length} mensagens para a campanha ${campaign._id}`);
    
    // Salvar mensagens no banco
    const insertResult = await Message.insertMany(messages, { session });
    logger.info(`Mensagens salvas no banco: ${insertResult.length} mensagens inseridas`);
    
    // Atualizar métricas da campanha
    await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        status: 'running',
        'metrics.total': contacts.length,
        'metrics.pending': contacts.length,
        lastUpdated: Date.now()
      },
      { session }
    );
    
    logger.info(`Status da campanha ${campaign._id} atualizado para 'running'`);
    
    // Concluir transação
    logger.info(`Finalizando transação MongoDB para campanha ${campaign._id}`);
    await session.commitTransaction();
    session.endSession();
    logger.info(`Transação MongoDB finalizada com sucesso para campanha ${campaign._id}`);
    
    // Enfileirar mensagens para envio em lotes para evitar sobrecarga
    const batchSize = instance.throttling?.perBatch || 50;
    const batchDelay = instance.throttling?.batchDelay || 5000; // 5 segundos entre lotes
    
    logger.info(`Configuração de throttling: batchSize=${batchSize}, batchDelay=${batchDelay}ms`);
    
    try {
      // Usar o método de enfileiramento em lote
      logger.info(`Tentando enfileirar ${messages.length} mensagens para a campanha ${campaign._id}`);
      const queueResult = await queueService.enqueueMessageBatch(messages, {
        batchSize,
        delay: batchDelay
      });
      
      logger.info(`Resultado do enfileiramento: ${JSON.stringify(queueResult)}`);
      logger.info(`Campanha ${campaign._id} iniciada com ${contacts.length} mensagens em ${queueResult.batches} lotes`);
      
      // Registrar evento de início de campanha
      await queueService.publishEvent({
        type: 'campaign_started',
        data: {
          campaignId: campaign._id,
          totalMessages: contacts.length,
          batches: queueResult.batches
        }
      });
      
      logger.info(`Evento 'campaign_started' publicado para a campanha ${campaign._id}`);
    } catch (queueError) {
      logger.error(`ERRO AO ENFILEIRAR MENSAGENS: ${queueError.message}`);
      logger.error(`Stack trace: ${queueError.stack}`);
      throw queueError;
    }
    
  } catch (error) {
    logger.error(`Erro ao iniciar campanha ${campaign._id}:`, error);
    logger.error(`Stack trace completo: ${error.stack}`);
    
    try {
      await session.abortTransaction();
      session.endSession();
      logger.info(`Transação abortada devido a erro para campanha ${campaign._id}`);
    } catch (sessionError) {
      logger.error(`Erro ao abortar transação: ${sessionError.message}`);
    }
    
    // Registrar evento de falha
    await queueService.publishEvent({
      type: 'campaign_start_failed',
      data: {
        campaignId: campaign._id,
        error: error.message
      }
    });
  }
};

let scheduledCampaignsInterval = null;
let completedCampaignsInterval = null;

const startScheduler = async () => {
  try {
    await queueService.connect();
    logger.info('Scheduler de campanhas iniciado');
    // Executar imediatamente
    await processScheduledCampaigns();
    await checkCompletedCampaigns();
    // Agendar execução a cada minuto
    scheduledCampaignsInterval = setInterval(processScheduledCampaigns, 60000);
    completedCampaignsInterval = setInterval(checkCompletedCampaigns, 60000);
  } catch (error) {
    logger.error('Erro ao iniciar scheduler:', error);
    process.exit(1);
  }
};

// Gerenciamento de processo
process.on('SIGTERM', async () => {
  logger.info('Scheduler recebeu SIGTERM, encerrando graciosamente...');
  if (scheduledCampaignsInterval) clearInterval(scheduledCampaignsInterval);
  if (completedCampaignsInterval) clearInterval(completedCampaignsInterval);
  await queueService.close();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Scheduler recebeu SIGINT, encerrando graciosamente...');
  if (scheduledCampaignsInterval) clearInterval(scheduledCampaignsInterval);
  if (completedCampaignsInterval) clearInterval(completedCampaignsInterval);
  await queueService.close();
  await mongoose.connection.close();
  process.exit(0);
});

// Iniciar scheduler
startScheduler(); 