// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SERVIDOR (Node.js/Express)
// ------------------------------------------------------------------
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); 
const app = express();
const PORT = process.env.PORT || 3000;

// Remove require('dotenv').config(); - Não é mais necessário e pode atrapalhar no Railway.
// Remove a função sleep - Vamos usar o Pool mais simples.

// URL DO SEU FRONTEND (SEM BARRA FINAL!)
const VERCEL_FRONTEND_URL = 'https://gerenciador-estoque-six.vercel.app'; 

// ------------------------------------------------------------------
// CONFIGURAÇÃO DE CORS SIMPLIFICADA E EFICAZ
// ------------------------------------------------------------------
const corsOptions = {
    origin: VERCEL_FRONTEND_URL, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); // Aplica as opções de CORS
app.use(express.json());

// ------------------------------------------------------------------
// ROTA OPTIONS (NECESSÁRIA PARA O PREFLIGHT)
// ------------------------------------------------------------------
app.options('*', cors(corsOptions));

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO BANCO DE DADOS (PostgreSQL) - SIMPLIFICADA E CORRIGIDA
// ------------------------------------------------------------------

// Removendo todas as variáveis de conexão manuais (DB_HOST, DB_USER, etc.)
// Confiando APENAS na variável DATABASE_URL fornecida pelo Railway.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: {
        // ESSENCIAL para ambientes de nuvem como o Railway
        rejectUnauthorized: false
    }
});

// A função criarTabelas foi ajustada para ser sincrona e mais robusta no startup
async function criarTabelas() {
    try {
        // Tenta se conectar e criar as tabelas
        const client = await pool.connect();
        
        // 1. Tabela de Produtos (Cadastro)
        await client.query(`
            CREATE TABLE IF NOT EXISTS produtos (
                codigoFabrica VARCHAR(50) PRIMARY KEY,
                codigoFornecedor VARCHAR(50) NOT NULL,
                descricaoProduto VARCHAR(255) NOT NULL,
                nomeFornecedor VARCHAR(255),
                unidadeMedida VARCHAR(10)
            )
        `);

        // 2. Tabela de Entradas (Movimentação)
        await client.query(`
            CREATE TABLE IF NOT EXISTS entradas (
                id SERIAL PRIMARY KEY,
                codigoFabrica VARCHAR(50) NOT NULL REFERENCES produtos(codigoFabrica),
                quantidade INTEGER NOT NULL,
                valorUnitario NUMERIC(10, 2) NOT NULL,
                valorTotal NUMERIC(10, 2) NOT NULL,
                notaFiscal VARCHAR(100),
                dataRegistro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Tabela de Saídas (Movimentação e Histórico)
        await client.query(`
            CREATE TABLE IF NOT EXISTS saidas (
                id SERIAL PRIMARY KEY,
                codigoFabrica VARCHAR(50) NOT NULL REFERENCES produtos(codigoFabrica),
                descricaoProduto VARCHAR(255),
                quantidade INTEGER NOT NULL,
                placaCaminhao VARCHAR(10),
                destinatario VARCHAR(255),
                dataRegistro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        client.release();
        console.log('Tabelas PostgreSQL criadas/verificadas com sucesso!');
        return true; 
    } catch (err) {
        console.error("ERRO FATAL: Falha ao criar tabelas no startup (DB inacessível).", err);
        return false;
    }
}

// ------------------------------------------------------------------
// INICIAR O SERVIDOR APÓS O DB ESTAR PRONTO
// ------------------------------------------------------------------

// Função principal de inicialização
async function startServer() {
    // 1. Tenta criar as tabelas (o Railway tentará reconectar, mas esta é a primeira tentativa)
    const dbReady = await criarTabelas();

    if (dbReady) {
        // 2. Inicia o servidor Express se o DB estiver ok
        app.listen(PORT, () => {
            console.log(`Servidor Express rodando na porta ${PORT}`);
        });
    } else {
        // 3. Se falhar, encerra o processo, e o Railway tentará novamente
        console.error("Servidor não pôde iniciar devido a erro no DB. Tentando novamente...");
        process.exit(1); 
    }
}

// Inicia o processo
startServer();


// ------------------------------------------------------------------
// ROTAS DE API (Endpoints)
// ------------------------------------------------------------------

// Rota de Teste
app.get('/', (req, res) => {
    res.send(`Servidor da Bora Transportes rodando e conectado ao PostgreSQL!`);
});


// Rotas de PRODUTOS (Cadastro)
app.post('/api/produtos', async (req, res) => {
    const { codigoFabrica, codigoFornecedor, descricaoProduto, nomeFornecedor, unidadeMedida } = req.body;
    
    if (!codigoFabrica || !descricaoProduto) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO produtos 
            (codigoFabrica, codigoFornecedor, descricaoProduto, nomeFornecedor, unidadeMedida) 
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (codigoFabrica) DO NOTHING 
            RETURNING codigoFabrica;
        `, [codigoFabrica.toUpperCase(), codigoFornecedor.toUpperCase(), descricaoProduto, nomeFornecedor, unidadeMedida]);

        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'Código de Fábrica já cadastrado.' });
        }
        res.status(201).json({ 
            message: 'Produto cadastrado com sucesso!', 
            codigoFabrica: codigoFabrica.toUpperCase() 
        });

    } catch (err) {
        console.error('Erro ao cadastrar produto (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao cadastrar produto.', details: err.message });
    }
});

// Busca de Produto
app.get('/api/produtos/search', async (req, res) => {
    const { codigoFabrica, codigoFornecedor, descricao } = req.query;
    let query = 'SELECT * FROM produtos WHERE 1=1';
    let params = [];

    try {
        if (codigoFabrica) {
            query += ' AND codigoFabrica = $1';
            params.push(codigoFabrica.toUpperCase());
        } else if (codigoFornecedor) {
            query += ' AND codigoFornecedor = $1';
            params.push(codigoFornecedor.toUpperCase());
        } else if (descricao) {
            query += ' AND descricaoProduto ILIKE $1'; 
            params.push(`%${descricao}%`);
        } else {
            return res.status(400).json({ error: 'Parâmetros de busca inválidos.' });
        }

        const result = await pool.query(query, params);

        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Produto não encontrado.' });
        }

    } catch (err) {
        console.error('Erro ao buscar produto (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao buscar produto.', details: err.message });
    }
});


// Rotas de ENTRADAS
app.post('/api/entradas', async (req, res) => {
    const { codigoFabrica, quantidade, valorUnitario, valorTotal, notaFiscal } = req.body;
    
    if (!codigoFabrica || !quantidade || !valorUnitario || !valorTotal) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    try {
        await pool.query(`
            INSERT INTO entradas 
            (codigoFabrica, quantidade, valorUnitario, valorTotal, notaFiscal) 
            VALUES ($1, $2, $3, $4, $5)`, 
            [codigoFabrica.toUpperCase(), quantidade, valorUnitario, valorTotal, notaFiscal]
        );
        res.status(201).json({ message: 'Entrada registrada com sucesso!' });
    } catch (err) {
        console.error('Erro ao registrar entrada (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao registrar entrada.', details: err.message });
    }
});


// Rotas de SAÍDAS
app.post('/api/saidas', async (req, res) => {
    const { codigoFabrica, quantidade, placaCaminhao, destinatario, descricaoProduto } = req.body;

    if (!codigoFabrica || !quantidade || !placaCaminhao || !destinatario) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }
    
    try {
        await pool.query(`
            INSERT INTO saidas 
            (codigoFabrica, descricaoProduto, quantidade, placaCaminhao, destinatario) 
            VALUES ($1, $2, $3, $4, $5)`, 
            [codigoFabrica.toUpperCase(), descricaoProduto, quantidade, placaCaminhao.toUpperCase(), destinatario]
        );
        res.status(201).json({ message: 'Saída registrada com sucesso!' });
    } catch (err) {
        console.error('Erro ao registrar saída (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao registrar saída.', details: err.message });
    }
});


// Rota para HISTÓRICO DE SAÍDAS
app.get('/api/saidas/historico', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM saidas ORDER BY dataRegistro DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar histórico (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao buscar histórico.', details: err.message });
    }
});


// Rota para CALCULAR SALDO
app.get('/api/saldo/:codigoFabrica', async (req, res) => {
    const codigoFabrica = req.params.codigoFabrica.toUpperCase();

    try {
        // Obter Total de Entradas
        const resEntrada = await pool.query(
            'SELECT SUM(quantidade) AS totalEntradas FROM entradas WHERE codigoFabrica = $1', 
            [codigoFabrica]
        );
        const totalEntradas = parseInt(resEntrada.rows[0].totalentradas) || 0;

        // Obter Total de Saídas
        const resSaida = await pool.query(
            'SELECT SUM(quantidade) AS totalSaidas FROM saidas WHERE codigoFabrica = $1', 
            [codigoFabrica]
        );
        const totalSaidas = parseInt(resSaida.rows[0].totalsaidas) || 0;

        const saldo = totalEntradas - totalSaidas;
        res.json({ codigoFabrica, saldo });

    } catch (err) {
        console.error('Erro ao calcular saldo (Postgres):', err.message);
        res.status(500).json({ error: 'Erro interno ao calcular saldo.', details: err.message });
    }
});
