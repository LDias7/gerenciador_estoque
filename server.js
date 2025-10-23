// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SERVIDOR (Node.js/Express)
// ------------------------------------------------------------------
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors'); // Necessário para permitir comunicação entre Frontend e Backend
const app = express();
const PORT = 3000;

// Middleware
app.use(cors({
    origin: 'https://gerenciador-estoque-six.vercel.app',
    methods: ['GET', 'POST'],
    credentials: true,
})); // Permite requisições de outras origens (seu frontend)
app.use(express.json()); // Permite que o Express leia o JSON enviado no corpo das requisições POST

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO BANCO DE DADOS (SQLite)
// ------------------------------------------------------------------
// Cria ou abre o arquivo 'estoque.db'
const db = new sqlite3.Database('./estoque.db', (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run('PRAGMA foreign_keys = ON;'); // Garante que chaves estrangeiras funcionem
        criarTabelas(); // Chama a função para criar as tabelas
    }
});

function criarTabelas() {
    // 1. Tabela de Produtos (Cadastro)
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        codigoFabrica TEXT PRIMARY KEY,
        codigoFornecedor TEXT NOT NULL,
        descricaoProduto TEXT NOT NULL,
        nomeFornecedor TEXT,
        unidadeMedida TEXT
    )`, (err) => {
        if (err) console.error("Erro ao criar tabela 'produtos':", err.message);
    });

    // 2. Tabela de Entradas (Movimentação)
    db.run(`CREATE TABLE IF NOT EXISTS entradas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigoFabrica TEXT NOT NULL,
        quantidade INTEGER NOT NULL,
        valorUnitario REAL NOT NULL,
        valorTotal REAL NOT NULL,
        notaFiscal TEXT,
        dataRegistro TEXT,
        FOREIGN KEY (codigoFabrica) REFERENCES produtos(codigoFabrica)
    )`, (err) => {
        if (err) console.error("Erro ao criar tabela 'entradas':", err.message);
    });

    // 3. Tabela de Saídas (Movimentação e Histórico)
    db.run(`CREATE TABLE IF NOT EXISTS saidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigoFabrica TEXT NOT NULL,
        descricaoProduto TEXT,
        quantidade INTEGER NOT NULL,
        placaCaminhao TEXT,
        destinatario TEXT,
        dataRegistro TEXT,
        FOREIGN KEY (codigoFabrica) REFERENCES produtos(codigoFabrica)
    )`, (err) => {
        if (err) console.error("Erro ao criar tabela 'saidas':", err.message);
    });
}

// ------------------------------------------------------------------
// ROTAS DE API (Endpoints)
// ------------------------------------------------------------------

// Rota de Teste
app.get('/', (req, res) => {
    res.send(`Servidor da Bora Transportes rodando na porta ${PORT}!`);
});


// Rotas de PRODUTOS (Cadastro)
// ------------------------------------------------------------------
app.post('/api/produtos', (req, res) => {
    const { codigoFabrica, codigoFornecedor, descricaoProduto, nomeFornecedor, unidadeMedida } = req.body;

    if (!codigoFabrica || !descricaoProduto) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    const stmt = db.prepare(`INSERT INTO produtos 
        (codigoFabrica, codigoFornecedor, descricaoProduto, nomeFornecedor, unidadeMedida) 
        VALUES (?, ?, ?, ?, ?)`);
    
    stmt.run(codigoFabrica.toUpperCase(), codigoFornecedor.toUpperCase(), descricaoProduto, nomeFornecedor, unidadeMedida, function(err) {
        if (err) {
            // Código 19 = Constraint Error (provavelmente chave primária duplicada)
            if (err.errno === 19) {
                return res.status(409).json({ error: 'Código de Fábrica já cadastrado.', details: err.message });
            }
            return res.status(500).json({ error: 'Erro ao cadastrar produto.', details: err.message });
        }
        res.status(201).json({ 
            message: 'Produto cadastrado com sucesso!', 
            id: this.lastID, 
            codigoFabrica: codigoFabrica.toUpperCase() 
        });
    });
    stmt.finalize();
});

// Busca de Produto (Por código de fábrica OU código de fornecedor)
app.get('/api/produtos/search', (req, res) => {
    const { codigoFabrica, codigoFornecedor, descricao } = req.query;
    let query = 'SELECT * FROM produtos WHERE 1=1';
    let params = [];

    if (codigoFabrica) {
        query += ' AND codigoFabrica = ?';
        params.push(codigoFabrica.toUpperCase());
    } else if (codigoFornecedor) {
        query += ' AND codigoFornecedor = ?';
        params.push(codigoFornecedor.toUpperCase());
    } else if (descricao) {
        // Usa LIKE para busca parcial na descrição
        query += ' AND descricaoProduto LIKE ?';
        params.push(`%${descricao}%`);
    }

    db.get(query, params, (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar produto.', details: err.message });
        }
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ message: 'Produto não encontrado.' });
        }
    });
});


// Rotas de ENTRADAS
// ------------------------------------------------------------------
app.post('/api/entradas', (req, res) => {
    const { codigoFabrica, quantidade, valorUnitario, valorTotal, notaFiscal } = req.body;
    const dataRegistro = new Date().toISOString();

    if (!codigoFabrica || !quantidade || !valorUnitario || !valorTotal) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    db.run(`INSERT INTO entradas 
        (codigoFabrica, quantidade, valorUnitario, valorTotal, notaFiscal, dataRegistro) 
        VALUES (?, ?, ?, ?, ?, ?)`, 
        [codigoFabrica.toUpperCase(), quantidade, valorUnitario, valorTotal, notaFiscal, dataRegistro], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao registrar entrada.', details: err.message });
            }
            res.status(201).json({ message: 'Entrada registrada com sucesso!', id: this.lastID });
    });
});


// Rotas de SAÍDAS
// ------------------------------------------------------------------
app.post('/api/saidas', (req, res) => {
    const { codigoFabrica, quantidade, placaCaminhao, destinatario, descricaoProduto } = req.body;
    const dataRegistro = new Date().toISOString();

    if (!codigoFabrica || !quantidade || !placaCaminhao || !destinatario) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    // Nota: A validação do SALDO é mais complexa e idealmente deve ser feita em um Trigger/Transação
    // SQL. Por enquanto, confiamos no cálculo feito no frontend (que será melhorado).
    
    db.run(`INSERT INTO saidas 
        (codigoFabrica, quantidade, placaCaminhao, destinatario, dataRegistro, descricaoProduto) 
        VALUES (?, ?, ?, ?, ?, ?)`, 
        [codigoFabrica.toUpperCase(), quantidade, placaCaminhao.toUpperCase(), destinatario, dataRegistro, descricaoProduto], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao registrar saída.', details: err.message });
            }
            res.status(201).json({ message: 'Saída registrada com sucesso!', id: this.lastID });
    });
});


// Rota para HISTÓRICO DE SAÍDAS
// ------------------------------------------------------------------
app.get('/api/saidas/historico', (req, res) => {
    db.all('SELECT * FROM saidas ORDER BY dataRegistro DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar histórico de saídas.', details: err.message });
        }
        res.json(rows);
    });
});


// Rota para CALCULAR SALDO (Essencial para a tela de Saldo e Saída)
// ------------------------------------------------------------------
app.get('/api/saldo/:codigoFabrica', (req, res) => {
    const codigoFabrica = req.params.codigoFabrica.toUpperCase();

    // 1. Obter Total de Entradas
    db.get('SELECT SUM(quantidade) AS totalEntradas FROM entradas WHERE codigoFabrica = ?', [codigoFabrica], (err, rowEntrada) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao calcular entradas.', details: err.message });
        }
        const totalEntradas = rowEntrada.totalEntradas || 0;

        // 2. Obter Total de Saídas
        db.get('SELECT SUM(quantidade) AS totalSaidas FROM saidas WHERE codigoFabrica = ?', [codigoFabrica], (err, rowSaida) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao calcular saídas.', details: err.message });
            }
            const totalSaidas = rowSaida.totalSaidas || 0;

            const saldo = totalEntradas - totalSaidas;
            res.json({ codigoFabrica, saldo });
        });
    });
});


// ------------------------------------------------------------------
// INICIAR O SERVIDOR
// ------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Servidor Express rodando em http://localhost:${PORT}`);

});
