const { 
  Campaign, 
  Contact, 
  Template, 
  Message, 
  Instance 
} = require('../models');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// Obter estatísticas gerais do sistema
exports.getStats = async (req, res) => {
  try {
    // Contagens
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalTemplates = await Template.countDocuments();
    const totalInstances = await Instance.countDocuments();
    
    // Contagem de mensagens por status
    const messageStats = await Message.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Formatar estatísticas de mensagens
    const messageStatusCount = {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0
    };
    
    messageStats.forEach(stat => {
      messageStatusCount[stat._id] = stat.count;
      messageStatusCount.total += stat.count;
    });
    
    // Campanhas ativas
    const activeCampaigns = await Campaign.countDocuments({
      status: { $in: ['queued', 'running'] }
    });
    
    // Instâncias conectadas
    const connectedInstances = await Instance.countDocuments({
      status: 'connected'
    });
    
    // Estatísticas de envio por dia (últimos 7 dias)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const dailyStats = await Message.aggregate([
      {
        $match: {
          sentAt: { $gte: last7Days },
          status: { $in: ['sent', 'delivered', 'read'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$sentAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Formatar estatísticas diárias
    const today = new Date();
    const dailySendStats = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const existingStat = dailyStats.find(stat => stat._id === dateStr);
      dailySendStats.push({
        date: dateStr,
        count: existingStat ? existingStat.count : 0
      });
    }
    
    // Taxas de sucesso e falha
    const successRate = messageStatusCount.total > 0 
      ? ((messageStatusCount.sent + messageStatusCount.delivered + messageStatusCount.read) / messageStatusCount.total) * 100 
      : 0;
    
    const failureRate = messageStatusCount.total > 0 
      ? (messageStatusCount.failed / messageStatusCount.total) * 100 
      : 0;
    
    res.status(200).json({
      success: true,
      data: {
        counts: {
          contacts: totalContacts,
          campaigns: totalCampaigns,
          templates: totalTemplates,
          instances: totalInstances,
          activeCampaigns,
          connectedInstances
        },
        messages: messageStatusCount,
        rates: {
          success: successRate.toFixed(2),
          failure: failureRate.toFixed(2)
        },
        dailyStats: dailySendStats
      }
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas do dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter campanhas recentes
exports.getRecentCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    logger.error('Erro ao obter campanhas recentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter campanhas recentes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter mensagens recentes com falha
exports.getRecentFailures = async (req, res) => {
  try {
    const messages = await Message.find({ status: 'failed' })
      .populate('campaignId', 'name')
      .populate('contactId', 'phone name')
      .sort({ updatedAt: -1 })
      .limit(10);
    
    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    logger.error('Erro ao obter mensagens com falha recentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter mensagens com falha recentes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter status das instâncias
exports.getInstancesStatus = async (req, res) => {
  try {
    const instances = await Instance.find()
      .select('instanceName status lastConnection metrics')
      .sort({ lastConnection: -1 });
    
    res.status(200).json({
      success: true,
      data: instances
    });
  } catch (error) {
    logger.error('Erro ao obter status das instâncias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter status das instâncias',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 