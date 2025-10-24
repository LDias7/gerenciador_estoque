// =========================================================================
// CONFIGURAÇÃO DO SHAREPOINT
// =========================================================================

// Variáveis essenciais para a API REST do SharePoint
const API_BASE_URL = _spPageContextInfo.webAbsoluteUrl + "/_api/web/lists/GetByTitle";

// Headers necessários para autenticação e formato de dados
const SHAREPOINT_HEADERS = {
    "Accept": "application/json;odata=verbose",
    "Content-Type": "application/json;odata=verbose",
    "X-RequestDigest": document.getElementById('__REQUESTDIGEST').value
};

/**
 * Função utilitária para fazer requisições à API REST do SharePoint.
 * @param {string} listTitle - Título da lista (Produtos, Entradas, Saidas).
 * @param {string} endpoint - O que fazer após GetByTitle('Lista') (ex: '/items').
 * @param {string} method - Método HTTP (GET, POST).
 * @param {object} data - Dados a serem enviados (apenas para POST).
 * @returns {Promise<any>} Dados da API.
 */
async function sharepointFetch(listTitle, endpoint, method = 'GET', data = null) {
    const url = `${API_BASE_URL}('${listTitle}')${endpoint}`;
    
    // Configura os headers para escrita (POST)
    const headers = method === 'POST' ? {...SHAREPOINT_HEADERS, "X-RequestDigest": document.getElementById('__REQUESTDIGEST').value} : {...SHAREPOINT_HEADERS};

    const config = {
        method: method,
        headers: headers,
        body: data ? JSON.stringify(data) : null
    };

    const response = await fetch(url, config);
    
    if (response.status === 404) return null; // Produto não encontrado
    if (!response.ok) throw new Error(`SharePoint API Error: ${response.status} - ${response.statusText}`);

    // Para GET e POST, o SharePoint retorna um objeto 'd'
    const json = await response.json();
    return json.d;
}

// =========================================================================
// FUNÇÕES DE UTILIDADE GERAL (Navegação permanece igual)
// =========================================================================

function navegarPara(telaAtualId, proximaTelaId) {
    // ... (Mantemos sua função de navegação aqui) ...
}

// ... (Copie o resto da sua função navegarPara aqui) ...

// -------------------------------------------------------------------------
// FUNÇÕES DE BUSCA (SHAREPOINT)
// -------------------------------------------------------------------------

/**
 * Busca um único produto por Código de Fábrica ou Código de Fornecedor.
 * Nota: No SharePoint, busca é feita por filtro OData.
 */
async function buscarProdutoAPI(params) {
    let filter = '';
    
    if (params.codigoFornecedor) {
        filter = `?$filter=CodigoFornecedor eq '${params.codigoFornecedor}'`;
    } else if (params.codigoFabrica) {
        // Se você usar "Title" para o Código de Fábrica:
        filter = `?$filter=Title eq '${params.codigoFabrica}'`; 
    } else if (params.descricao) {
        // Busca parcial (Requires Indexing on SharePoint):
        filter = `?$filter=substringof('${params.descricao}', DescricaoProduto)`;
    } else {
        return null;
    }

    try {
        const data = await sharepointFetch('Produtos', `/items${filter}&$top=1`);
        
        if (data && data.results && data.results.length > 0) {
            // Mapeia o resultado do SharePoint para o formato do seu sistema
            const spItem = data.results[0];
            return {
                codigoFabrica: spItem.Title || spItem.CodigoFabrica,
                codigoFornecedor: spItem.CodigoFornecedor,
                descricaoProduto: spItem.DescricaoProduto,
                nomeFornecedor: spItem.NomeFornecedor,
                unidadeMedida: spItem.UnidadeMedida,
                __metadata: spItem.__metadata // Essencial para futura atualização/deleção
            };
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar produto no SharePoint:', error);
        return null;
    }
}

/**
 * Obtém o saldo atual calculando Entradas - Saídas.
 * Nota: Isso fará MÚLTIPLAS requisições ao SharePoint (não é ideal, mas funcional).
 */
async function obterSaldoAPI(codigoFabrica) {
    try {
        // 1. Obter Entradas
        const filterEntrada = `?$filter=CodigoFabrica eq '${codigoFabrica}'`;
        const entradasData = await sharepointFetch('Entradas', `/items${filterEntrada}`);
        const totalEntradas = entradasData.results.reduce((sum, item) => sum + (item.Quantidade || 0), 0);

        // 2. Obter Saídas
        const filterSaida = `?$filter=CodigoFabrica eq '${codigoFabrica}'`;
        const saidasData = await sharepointFetch('Saidas', `/items${filterSaida}`);
        const totalSaidas = saidasData.results.reduce((sum, item) => sum + (item.Quantidade || 0), 0);

        return totalEntradas - totalSaidas;
    } catch (error) {
        console.error('Erro ao calcular saldo no SharePoint:', error);
        return 0; 
    }
}


// =========================================================================
// LÓGICA DAS TELAS (Os Event Listeners)
// =========================================================================

// Função calcularValorTotal (mantida, pois é lógica de frontend)
function calcularValorTotal() {
    // ... (Mantemos sua função aqui) ...
}

// ... (Copie o resto da sua função calcularValorTotal aqui) ...


// ---------------------------------------------------------------------
// 2. TELA DE CADASTRO - SALVAMENTO (SHAREPOINT)
// ---------------------------------------------------------------------
document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const novosDados = {
        // No SharePoint, a coluna "Title" é frequentemente usada como a chave principal.
        '__metadata': { 'type': 'SP.Data.ProdutosListItem' }, // Nome interno da lista (necessário!)
        'Title': document.getElementById('codigoFabrica').value.trim().toUpperCase(), 
        'CodigoFornecedor': document.getElementById('codigoFornecedor').value.trim().toUpperCase(),
        'DescricaoProduto': document.getElementById('descricaoProduto').value.trim(),
        'NomeFornecedor': document.getElementById('nomeFornecedor').value.trim(),
        'UnidadeMedida': document.getElementById('unidadeMedida').value.trim(),
    };

    try {
        // 1. Verifica se já existe para evitar erro (SharePoint não tem ON CONFLICT)
        const produtoExistente = await buscarProdutoAPI({ codigoFabrica: novosDados.Title });

        if (produtoExistente) {
            alert(`ERRO: O Código de Fábrica "${novosDados.Title}" já existe no SharePoint.`);
            return;
        }

        // 2. Envia para a Lista 'Produtos'
        await sharepointFetch('Produtos', '/items', 'POST', novosDados);

        alert(`Produto ${novosDados.DescricaoProduto} cadastrado com sucesso no SharePoint!`);
        document.getElementById('form-cadastro').reset(); 
        navegarPara('tela-cadastro', 'tela-principal'); 

    } catch (error) {
        console.error('Erro ao cadastrar no SharePoint:', error);
        alert(`Erro ao cadastrar: ${error.message}. Verifique as permissões e o nome das colunas.`);
    }
});


// ---------------------------------------------------------------------
// 3. TELA DE ENTRADA - SALVAMENTO (SHAREPOINT)
// ---------------------------------------------------------------------
document.getElementById('form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();

    const codigoFabrica = document.getElementById('displayCodFabrica').textContent;
    
    const dadosEntrada = {
        '__metadata': { 'type': 'SP.Data.EntradasListItem' }, // Nome interno da lista (necessário!)
        'Title': codigoFabrica, // Usamos o Cód. Fábrica como título
        'CodigoFabrica': codigoFabrica,
        'Quantidade': parseFloat(document.getElementById('entradaQuantidade').value),
        'ValorUnitario': parseFloat(document.getElementById('entradaValorUnitario').value),
        'ValorTotal': parseFloat(document.getElementById('entradaValorTotal').value),
        'NotaFiscal': document.getElementById('entradaNotaFiscal').value,
    };

    try {
        await sharepointFetch('Entradas', '/items', 'POST', dadosEntrada);

        alert(`Entrada de ${dadosEntrada.Quantidade} unidades registrada com sucesso no SharePoint!`);
        
        document.getElementById('form-entrada').reset();
        navegarPara('tela-entrada', 'tela-principal');

    } catch (error) {
        console.error('Erro ao registrar entrada no SharePoint:', error);
        alert(`Erro ao registrar entrada: ${error.message}.`);
    }
});


// ---------------------------------------------------------------------
// 4. TELA DE SAÍDA - SALVAMENTO (SHAREPOINT)
// ---------------------------------------------------------------------
document.getElementById('form-saida').addEventListener('submit', async (e) => {
    e.preventDefault();

    const inputSaidaCodFabrica = document.getElementById('saidaCodigoFabrica');
    const codigoFabrica = inputSaidaCodFabrica.value.trim().toUpperCase();
    const quantidadeSaida = parseInt(document.getElementById('saidaQuantidade').value);
    const descricaoProduto = document.getElementById('saidaDisplayDescricao').textContent;
    
    // 1. Validar Saldo (agora feito localmente pelo JS que busca o saldo)
    const saldoAtual = parseInt(document.getElementById('saidaDisplayEstoque').textContent);

    if (quantidadeSaida > saldoAtual) {
        alert(`ERRO: A quantidade de saída (${quantidadeSaida}) é maior que o saldo atual (${saldoAtual}).`);
        return; 
    }

    const dadosSaida = {
        '__metadata': { 'type': 'SP.Data.SaidasListItem' }, // Nome interno da lista (necessário!)
        'Title': codigoFabrica, // Usamos o Cód. Fábrica como título
        'CodigoFabrica': codigoFabrica,
        'DescricaoProduto': descricaoProduto,
        'Quantidade': quantidadeSaida,
        'PlacaCaminhao': document.getElementById('saidaPlacaCaminhao').value.trim().toUpperCase(),
        'Destinatario': document.getElementById('saidaDestinatario').value.trim(),
    };

    try {
        await sharepointFetch('Saidas', '/items', 'POST', dadosSaida);

        alert(`Saída de ${dadosSaida.Quantidade} de ${codigoFabrica} registrada com sucesso no SharePoint!`);
        
        document.getElementById('form-saida').reset();
        navegarPara('tela-saida', 'tela-principal');
        
    } catch (error) {
        console.error('Erro ao registrar saída no SharePoint:', error);
        alert(`Erro ao registrar saída: ${error.message}.`);
    }
});

// ... (O restante da lógica de evento e do DOMContentLoaded deve ser copiado aqui) ...
