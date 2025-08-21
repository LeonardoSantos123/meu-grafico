require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DB_ID;
const AMOUNT_PROP = process.env.AMOUNT_PROP || 'Amount';

// Função para buscar todos os itens da database (paginação incluída)
async function getAllPages(databaseId) {
  let results = [];
  let cursor = undefined;
  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}

// Pega o valor numérico da coluna Amount
function extractNumber(page, propName) {
  const prop = page.properties[propName];
  if (!prop) return 0;
  if (prop.type === 'number') return prop.number || 0;
  if (prop.type === 'formula' && prop.formula.type === 'number') {
    return prop.formula.number || 0;
  }
  return 0;
}

// Função para somar valores em um grupo
function addToGroup(groups, key, amount) {
  if (!key) key = 'Sem Account';
  groups[key] = (groups[key] || 0) + amount;
}

// Endpoint /api/networth
app.get('/api/networth', async (req, res) => {
  try {
    const pages = await getAllPages(DB_ID);

    let total = 0;
    const groups = {};

    for (const page of pages) {
      const amount = extractNumber(page, AMOUNT_PROP);
      if (!amount) continue; // ignora se vazio ou 0

      total += amount;

      const accProp = page.properties['Account'];
      if (!accProp) {
        addToGroup(groups, 'Sem Account', amount);
        continue;
      }

      if (accProp.type === 'select') {
        addToGroup(groups, accProp.select ? accProp.select.name : 'Sem Account', amount);
      } else {
        addToGroup(groups, 'Sem Account', amount);
      }
    }

    res.json({ total, groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao consultar Notion' });
  }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
