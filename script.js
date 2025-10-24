// =========================================================================
// CONFIGURAÇÃO DA API
// =========================================================================
const API_BASE_URL = '/api';


// =========================================================================
// FUNÇÕES DE UTILIDADE GERAL
// =========================================================================

/**
 * Função genérica para trocar de tela
 */
function navegarPara(telaAtualId, proximaTelaId) {
    document.querySelectorAll('.screen').forEach(tela => {
        tela.classList.remove('active');
    });

    const proximaTela = document.getElementById(proximaTelaId);
    if (proximaTela) {
        proximaTela.classList.add('active');
        if (proximaTelaId === 'tela-historico-saida') {
            carregarHistoricoSaidas();
        }
        if (proximaTelaId === 'tela-saldo') {
            // Limpa campos e resultado ao abrir
            document.getElementById('saldoCodigoFabrica').value = '';
            document.getElementById('saldoDescricao').value = '';
            limparResultadoSaldo();
        }
    }
}


// -------------------------------------------------------------------------
// FUNÇÕES DE BUSCA (BACKEND)
// -------------------------------------------------------------------------

/**
 * Busca um único produto por um dos códigos (Fábrica ou Fornecedor) ou Descrição.
 * @param {object} params - Deve conter codigoFabrica, codigoFornecedor, OU descricao.
 * @returns {Promise<object | null>} O objeto produto ou null se não for encontrado.
 */
async function buscarProdutoAPI(params) {
    // Converte o objeto params em string de query (ex: ?codigoFabrica=X-500)
    const queryString = new URLSearchParams(params).toString();
    
    try {
        const response = await fetch(`${API_BASE_URL}/produtos/search?${queryString}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Erro na busca: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar produto na API:', error);
        return null;
    }
}

/**
 * Obtém o saldo atual de um produto do backend.
 * @param {string} codigoFabrica
 * @returns {Promise<number>} O saldo atual.
 */
async function obterSaldoAPI(codigoFabrica) {
    try {
        const response = await fetch(`${API_BASE_URL}/saldo/${codigoFabrica}`);
        if (!response.ok) {
            throw new Error(`Erro ao buscar saldo: ${response.statusText}`);
        }
        const data = await response.json();
        return data.saldo;
    } catch (error) {
        console.error('Erro ao obter saldo na API:', error);
        return 0; // Retorna 0 em caso de erro
    }
}


// =========================================================================
// LÓGICA DA TELA DE ENTRADA
// =========================================================================

function calcularValorTotal() {
    const quantidade = parseFloat(document.getElementById('entradaQuantidade').value) || 0;
    const valorUnitario = parseFloat(document.getElementById('entradaValorUnitario').value) || 0;
    const valorTotalElement = document.getElementById('entradaValorTotal');
    const btnSalvar = document.getElementById('btn-salvar-entrada');

    let valorTotal = quantidade * valorUnitario;
    
    valorTotalElement.value = valorTotal.toFixed(2);
    
    if (quantidade > 0 && valorUnitario >= 0) { 
        btnSalvar.disabled = false;
    } else {
        btnSalvar.disabled = true;
    }
}

/**
 * Lógica de busca de produto na Entrada (usando Código do Fornecedor)
 */
async function processarBuscaEntrada() {
    const inputEntradaCodFornecedor = document.getElementById('entradaCodigoFornecedor');
    const displayDados = document.getElementById('entrada-dados-produto');
    const newFields = document.getElementById('entrada-new-fields');
    const btnSalvar = document.getElementById('btn-salvar-entrada');

    const codigoBuscado = inputEntradaCodFornecedor.value.trim().toUpperCase();
    
    if (!codigoBuscado) return;

    const produto = await buscarProdutoAPI({ codigoFornecedor: codigoBuscado });
    
    if (produto) {
        document.getElementById('displayDescricao').textContent = produto.descricaoProduto;
        document.getElementById('displayCodFabrica').textContent = produto.codigoFabrica;
        document.getElementById('displayFornecedor').textContent = produto.nomeFornecedor;
        document.getElementById('displayUnidade').textContent = produto.unidadeMedida;
        
        displayDados.style.display = 'block';
        newFields.style.display = 'block';
        document.getElementById('entradaQuantidade').focus();
    } else {
        alert(`Produto com Código do Fornecedor "${codigoBuscado}" não encontrado no cadastro.`);
        displayDados.style.display = 'none';
        newFields.style.display = 'none';
        btnSalvar.disabled = true;
    }
}


// =========================================================================
// LÓGICA DA TELA DE SAÍDA
// =========================================================================

/**
 * Lógica de busca de produto na Saída (usando Código de Fábrica) e cálculo de Saldo.
 */
async function carregarDadosSaida() {
    const inputSaidaCodFabrica = document.getElementById('saidaCodigoFabrica');
    const displayDados = document.getElementById('saida-dados-produto');
    const newFields = document.getElementById('saida-new-fields');
    const btnSalvar = document.getElementById('btn-salvar-saida');

    const codigoBuscado = inputSaidaCodFabrica.value.trim().toUpperCase();
    
    if (!codigoBuscado) return;

    const produto = await buscarProdutoAPI({ codigoFabrica: codigoBuscado });

    if (produto) {
        const saldoAtual = await obterSaldoAPI(produto.codigoFabrica); // Chamada API para Saldo

        // Preenche os dados
        document.getElementById('saidaDisplayDescricao').textContent = produto.descricaoProduto;
        document.getElementById('saidaDisplayCodFornecedor').textContent = produto.codigoFornecedor;
        document.getElementById('saidaDisplayEstoque').textContent = saldoAtual;
        document.getElementById('saidaDisplayData').textContent = new Date().toLocaleDateString('pt-BR');
        
        // Verifica o saldo para alerta visual
        const estoqueElement = document.getElementById('saidaDisplayEstoque');
        if (saldoAtual <= 5) {
            estoqueElement.classList.add('baixo');
        } else {
            estoqueElement.classList.remove('baixo');
        }

        displayDados.style.display = 'block';
        newFields.style.display = 'block';
        document.getElementById('saidaQuantidade').focus();
        btnSalvar.disabled = false; 

    } else {
        alert(`Produto com Código de Fábrica "${codigoBuscado}" não encontrado no cadastro.`);
        displayDados.style.display = 'none';
        newFields.style.display = 'none';
        btnSalvar.disabled = true;
    }
}

/**
 * Carrega os registros de saída na tabela do Histórico (API).
 */
async function carregarHistoricoSaidas() {
    const tbody = document.getElementById('historico-saidas-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando histórico...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/saidas/historico`);
        if (!response.ok) throw new Error('Falha ao carregar histórico.');
        
        const historico = await response.json();
        tbody.innerHTML = ''; // Limpa o carregamento

        if (historico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum registro de saída encontrado.</td></tr>';
            return;
        }

        historico.forEach(registro => {
            const tr = document.createElement('tr');
            // Formata a data ISO para BR
            const dataFormatada = new Date(registro.dataRegistro).toLocaleDateString('pt-BR');
            
            tr.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${registro.codigoFabrica}</td>
                <td>${registro.descricaoProduto}</td>
                <td>${registro.quantidade}</td>
                <td>${registro.placaCaminhao}</td>
                <td>${registro.destinatario}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao conectar com o servidor.</td></tr>';
    }
}


// =========================================================================
// LÓGICA DA TELA DE SALDO
// =========================================================================

function limparResultadoSaldo() {
    document.getElementById('saldoDisplayDescricao').textContent = 'Nenhum produto selecionado';
    document.getElementById('saldoDisplayCodFabrica').textContent = 'N/A';
    document.getElementById('saldoDisplayQuantidade').textContent = '0';
    document.getElementById('saldoDisplayUnidade').textContent = '';
    document.getElementById('saldoDisplayQuantidade').classList.remove('baixo');
}

/**
 * Exibe o saldo na tela
 * @param {object} produto - O objeto produto encontrado.
 * @param {number} saldo - O saldo atual.
 */
function exibirSaldo(produto, saldo) {
    const saldoElement = document.getElementById('saldoDisplayQuantidade');
    
    document.getElementById('saldoDisplayDescricao').textContent = produto.descricaoProduto;
    document.getElementById('saldoDisplayCodFabrica').textContent = produto.codigoFabrica;
    saldoElement.textContent = saldo;
    document.getElementById('saldoDisplayUnidade').textContent = produto.unidadeMedida;

    if (saldo <= 5) {
        saldoElement.classList.add('baixo');
    } else {
        saldoElement.classList.remove('baixo');
    }
}

/**
 * Lógica principal de filtro para a tela de Saldo (API).
 */
async function processarFiltroSaldo(campoAlterado) {
    const inputFabrica = document.getElementById('saldoCodigoFabrica');
    const inputDescricao = document.getElementById('saldoDescricao');
    
    let produto = null;
    const codFabricaValue = inputFabrica.value.trim().toUpperCase();
    const descricaoValue = inputDescricao.value.trim();

    if (campoAlterado === 'fabrica' && codFabricaValue) {
        produto = await buscarProdutoAPI({ codigoFabrica: codFabricaValue });
        if (produto) {
            inputDescricao.value = produto.descricaoProduto; 
        } else {
            inputDescricao.value = '';
            limparResultadoSaldo();
            return;
        }

    } else if (campoAlterado === 'descricao' && descricaoValue) {
        // Nota: A busca por descrição no backend pode retornar múltiplos, 
        // mas aqui pegamos o primeiro (como fizemos no server.js)
        produto = await buscarProdutoAPI({ descricao: descricaoValue }); 
        if (produto) {
            inputFabrica.value = produto.codigoFabrica;
        } else {
            inputFabrica.value = '';
            limparResultadoSaldo();
            return;
        }
    } else {
        limparResultadoSaldo();
        return;
    }

    if (produto) {
        const saldo = await obterSaldoAPI(produto.codigoFabrica);
        exibirSaldo(produto, saldo);
    } else {
        limparResultadoSaldo();
    }
}


// =========================================================================
// EVENT LISTENERS (Ao carregar a página)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // ---------------------------------------------------------------------
    // 1. NAVEGAÇÃO
    // ---------------------------------------------------------------------
    document.getElementById('btn-cadastro').addEventListener('click', () => { navegarPara('tela-principal', 'tela-cadastro'); });
    document.getElementById('btn-entrada').addEventListener('click', () => { 
        navegarPara('tela-principal', 'tela-entrada');
        document.getElementById('form-entrada').reset();
        document.getElementById('entrada-dados-produto').style.display = 'none';
        document.getElementById('entrada-new-fields').style.display = 'none';
        document.getElementById('btn-salvar-entrada').disabled = true;
    });
    document.getElementById('btn-saida').addEventListener('click', () => { 
        navegarPara('tela-principal', 'tela-saida'); 
        document.getElementById('form-saida').reset();
        document.getElementById('saida-dados-produto').style.display = 'none';
        document.getElementById('saida-new-fields').style.display = 'none';
        document.getElementById('btn-salvar-saida').disabled = true;
    });
    document.getElementById('btn-saldo').addEventListener('click', () => { navegarPara('tela-principal', 'tela-saldo'); });

    document.getElementById('btn-voltar-cadastro').addEventListener('click', () => { navegarPara('tela-cadastro', 'tela-principal'); });
    document.getElementById('btn-voltar-entrada').addEventListener('click', () => { navegarPara('tela-entrada', 'tela-principal'); });
    document.getElementById('btn-voltar-saida').addEventListener('click', () => { navegarPara('tela-saida', 'tela-principal'); });
    document.getElementById('btn-voltar-saldo').addEventListener('click', () => { navegarPara('tela-saldo', 'tela-principal'); });

    document.getElementById('btn-historico-saida').addEventListener('click', () => { navegarPara('tela-saida', 'tela-historico-saida'); });
    document.getElementById('btn-voltar-historico').addEventListener('click', () => { navegarPara('tela-historico-saida', 'tela-saida'); });


    // ---------------------------------------------------------------------
    // 2. TELA DE CADASTRO - SALVAMENTO (API)
    // ---------------------------------------------------------------------
    document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const novosDados = {
            codigoFabrica: document.getElementById('codigoFabrica').value.trim().toUpperCase(),
            codigoFornecedor: document.getElementById('codigoFornecedor').value.trim().toUpperCase(),
            descricaoProduto: document.getElementById('descricaoProduto').value.trim(),
            nomeFornecedor: document.getElementById('nomeFornecedor').value.trim(),
            unidadeMedida: document.getElementById('unidadeMedida').value.trim(),
        };

        try {
            const response = await fetch(`${API_BASE_URL}/produtos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novosDados)
            });

            const data = await response.json();

            if (response.ok) {
                alert(`Produto ${novosDados.descricaoProduto} cadastrado com sucesso!`);
                document.getElementById('form-cadastro').reset(); 
                navegarPara('tela-cadastro', 'tela-principal'); 
            } else if (response.status === 409) {
                alert(`ERRO: ${data.error}. O Código de Fábrica "${novosDados.codigoFabrica}" já existe.`);
            } else {
                alert(`Erro ao cadastrar: ${data.error || 'Erro desconhecido.'}`);
            }

        } catch (error) {
            console.error('Erro de conexão:', error);
            alert('ERRO: Falha ao conectar com o servidor. Verifique se o server.js está rodando.');
        }
    });


    // ---------------------------------------------------------------------
    // 3. TELA DE ENTRADA - LÓGICA E SALVAMENTO (API)
    // ---------------------------------------------------------------------
    document.getElementById('entradaQuantidade').addEventListener('input', calcularValorTotal);
    document.getElementById('entradaValorUnitario').addEventListener('input', calcularValorTotal);

    document.getElementById('entradaCodigoFornecedor').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            processarBuscaEntrada();
        }
    });

    document.getElementById('form-entrada').addEventListener('submit', async (e) => {
        e.preventDefault();

        const codigoFabrica = document.getElementById('displayCodFabrica').textContent;
        
        const dadosEntrada = {
            codigoFabrica: codigoFabrica,
            quantidade: parseFloat(document.getElementById('entradaQuantidade').value),
            valorUnitario: parseFloat(document.getElementById('entradaValorUnitario').value),
            valorTotal: parseFloat(document.getElementById('entradaValorTotal').value),
            notaFiscal: document.getElementById('entradaNotaFiscal').value,
        };

        try {
             const response = await fetch(`${API_BASE_URL}/entradas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosEntrada)
            });
            const data = await response.json();

            if (response.ok) {
                alert(`Entrada de ${dadosEntrada.quantidade} de ${codigoFabrica} registrada com sucesso!`);
            } else {
                alert(`Erro ao registrar entrada: ${data.error || 'Erro desconhecido.'}`);
            }
        } catch (error) {
             alert('ERRO: Falha ao conectar com o servidor. Verifique se o server.js está rodando.');
        }

        document.getElementById('form-entrada').reset();
        navegarPara('tela-entrada', 'tela-principal');
    });

    
    // ---------------------------------------------------------------------
    // 4. TELA DE SAÍDA - LÓGICA E SALVAMENTO (API)
    // ---------------------------------------------------------------------
    document.getElementById('saidaCodigoFabrica').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            carregarDadosSaida();
        }
    });

    document.getElementById('form-saida').addEventListener('submit', async (e) => {
        e.preventDefault();

        const inputSaidaCodFabrica = document.getElementById('saidaCodigoFabrica');
        const codigoFabrica = inputSaidaCodFabrica.value.trim().toUpperCase();
        const quantidadeSaida = parseInt(document.getElementById('saidaQuantidade').value);
        const descricaoProduto = document.getElementById('saidaDisplayDescricao').textContent;
        
        // 1. Validar Saldo ANTES de enviar para o servidor
        const saldoAtual = parseInt(document.getElementById('saidaDisplayEstoque').textContent);

        if (quantidadeSaida > saldoAtual) {
            alert(`ERRO: A quantidade de saída (${quantidadeSaida}) é maior que o saldo atual (${saldoAtual}).`);
            return; 
        }

        // 2. Montar Dados e Enviar para API
        const dadosSaida = {
            codigoFabrica: codigoFabrica,
            descricaoProduto: descricaoProduto,
            quantidade: quantidadeSaida,
            placaCaminhao: document.getElementById('saidaPlacaCaminhao').value.trim().toUpperCase(),
            destinatario: document.getElementById('saidaDestinatario').value.trim(),
        };

        try {
            const response = await fetch(`${API_BASE_URL}/saidas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosSaida)
            });
            const data = await response.json();

            if (response.ok) {
                alert(`Saída de ${dadosSaida.quantidade} de ${codigoFabrica} registrada com sucesso!`);
            } else {
                alert(`Erro ao registrar saída: ${data.error || 'Erro desconhecido.'}`);
            }
        } catch (error) {
             alert('ERRO: Falha ao conectar com o servidor. Verifique se o server.js está rodando.');
        }
        
        document.getElementById('form-saida').reset();
        navegarPara('tela-saida', 'tela-principal');
    });

    
    // ---------------------------------------------------------------------
    // 5. TELA DE SALDO - LÓGICA (API)
    // ---------------------------------------------------------------------
    document.getElementById('saldoCodigoFabrica').addEventListener('input', () => {
        processarFiltroSaldo('fabrica');
    });

    document.getElementById('saldoDescricao').addEventListener('input', () => {
        processarFiltroSaldo('descricao');
    });


});

