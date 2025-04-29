/**
 * Script para corrigir campanhas com nomes de instâncias em vez de IDs
 * 
 * Execute com: node src/scripts/fixCampaignInstances.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Modelos
const { Campaign, Instance } = require('../models');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => console.log('Conectado ao MongoDB'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

async function fixCampaigns() {
  try {
    console.log('Iniciando correção de campanhas...');
    
    // Obter todas as instâncias para mapear nomes para IDs
    const instances = await Instance.find({}, 'instanceName');
    const instanceMap = {};
    
    // Criar mapa de nome da instância para ID
    instances.forEach(instance => {
      instanceMap[instance.instanceName] = instance._id;
    });
    
    console.log(`Encontradas ${instances.length} instâncias`);
    
    // Obter todas as campanhas
    const campaigns = await Campaign.find({});
    console.log(`Encontradas ${campaigns.length} campanhas`);
    
    let corrected = 0;
    let skipped = 0;
    let notFound = 0;
    
    // Para cada campanha, verificar se o instanceId é um nome de instância
    for (const campaign of campaigns) {
      // Verificar se o instanceId não parece ser um ID MongoDB (24 caracteres hexadecimais)
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(campaign.instanceId);
      
      if (!isObjectId) {
        // É um nome de instância, então precisamos convertê-lo para ID
        const instanceName = campaign.instanceId;
        
        if (instanceMap[instanceName]) {
          // Encontramos um ID correspondente para este nome
          console.log(`Corrigindo campanha ${campaign.name} (${campaign._id}): ${instanceName} -> ${instanceMap[instanceName]}`);
          
          campaign.instanceId = instanceMap[instanceName];
          await campaign.save();
          corrected++;
        } else {
          // Não encontramos instância com este nome
          console.error(`Instância não encontrada para campanha ${campaign.name} (${campaign._id}): ${instanceName}`);
          notFound++;
        }
      } else {
        // Já é um ID MongoDB válido, então mantemos como está
        skipped++;
      }
    }
    
    console.log('\nResumo:');
    console.log(`- Total de campanhas: ${campaigns.length}`);
    console.log(`- Campanhas corrigidas: ${corrected}`);
    console.log(`- Campanhas já corretas: ${skipped}`);
    console.log(`- Instâncias não encontradas: ${notFound}`);
    
    console.log('\nCorreção concluída!');
  } catch (error) {
    console.error('Erro ao corrigir campanhas:', error);
  } finally {
    // Desconectar do MongoDB
    mongoose.disconnect();
  }
}

// Executar script
fixCampaigns(); 