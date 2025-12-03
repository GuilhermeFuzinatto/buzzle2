const API = '/api';
let usuario = JSON.parse(localStorage.getItem('usuario'));
let turmaSelId = null;
let perguntasCache = [];
let detalhesTentativa = [];

// MENU TOGGLE
function toggleMenu() {
    document.getElementById("dropdown").classList.toggle("show");
}
window.onclick = function(event) {
    if (!event.target.matches('.user-avatar')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}

function mostrar(id) {
    document.querySelectorAll('.container').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    // Mostra o avatar se não for tela de login
    if(id !== 'tela-login') document.getElementById('userMenu').classList.remove('hidden');
    else document.getElementById('userMenu').classList.add('hidden');
}

function sair() { localStorage.clear(); location.reload(); }

window.onload = () => {
    const ano = new Date().getFullYear();
    const sel = document.getElementById('selAnoLetivo');
    if(sel) sel.innerHTML = `<option>${ano}</option><option>${ano+1}</option>`;

    if(!usuario) mostrar('tela-login');
    else {
        if(usuario.tipo === 'admin') carregarAdmin();
        else if(usuario.tipo === 'prof') carregarProf();
        else carregarAluno();
    }
};

// LOGIN
async function fazerLogin() {
    const login = document.getElementById('loginInput').value;
    const senha = document.getElementById('loginSenha').value;
    const res = await fetch(`${API}/login`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({login, senha})
    });
    const data = await res.json();
    if(res.ok) {
        localStorage.setItem('usuario', JSON.stringify(data));
        location.reload();
    } else alert(data.erro);
}

// ADMIN
function navAdmin(aba) {
    document.getElementById('admin-profs').classList.add('hidden');
    document.getElementById('admin-relatorios').classList.add('hidden');
    document.getElementById(`admin-${aba}`).classList.remove('hidden');
    if(aba === 'profs') listarProfsAdmin();
    if(aba === 'relatorios') listarProfsSelect();
}

async function carregarAdmin() {
    mostrar('tela-admin');
    navAdmin('profs');
}
async function listarProfsAdmin() {
    const res = await fetch(`${API}/admin/profs`);
    const profs = await res.json();
    document.getElementById('lista-profs').innerHTML = profs.map(p => 
        `<div class="card">${p.nome} (${p.email}) <button onclick="toggleProf(${p.id}, ${p.ativo})" class="secondary" style="width:auto">${p.ativo?'Bloquear':'Ativar'}</button></div>`
    ).join('');
}
async function listarProfsSelect() {
    const res = await fetch(`${API}/admin/profs`);
    const profs = await res.json();
    const sel = document.getElementById('selAdminProf');
    sel.innerHTML = '<option value="">Selecione o Professor...</option>';
    profs.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
}
async function carregarRelatorioAdmin() {
    const profId = document.getElementById('selAdminProf').value;
    if(!profId) return;
    
    // TRUQUE: Reutilizar a lógica de carregar select de turmas de relatório
    // Mas temporariamente fingindo que o 'usuario.id' é o prof selecionado
    const originalId = usuario.id;
    usuario.id = profId; // Troca ID temporariamente
    
    // Limpa a área de render e move o bloco de relatório do prof pra cá
    const blocoRelatorio = document.getElementById('prof-relatorios');
    const areaAdmin = document.getElementById('admin-area-relatorio-render');
    
    blocoRelatorio.classList.remove('hidden'); // Torna visível
    carregarSelectTurmasRelatorio(); // Carrega turmas do prof selecionado
    
    // Clone node ou mover? Mover é mais fácil para manter os eventos
    areaAdmin.innerHTML = '';
    areaAdmin.appendChild(blocoRelatorio);
    
    usuario.id = originalId; // Restaura ID
}

async function admCriarProf() {
    await fetch(`${API}/admin/prof`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome: document.getElementById('admNome').value, email: document.getElementById('admEmail').value, senha: document.getElementById('admSenha').value})});
    listarProfsAdmin();
}
async function toggleProf(id, ativo) {
    await fetch(`${API}/admin/prof/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ativo: ativo?0:1}) });
    listarProfsAdmin();
}

// PROFESSOR
function carregarProf() { mostrar('tela-prof'); document.getElementById('profNome').innerText = usuario.nome; navProf('turmas'); }
function navProf(aba) { 
    ['turmas','quiz','relatorios'].forEach(id => document.getElementById(`prof-${id}`).classList.add('hidden')); 
    document.getElementById(`prof-${aba}`).classList.remove('hidden'); 
    
    // Se o bloco de relatórios estiver no admin (foi movido), traz de volta
    if(aba === 'relatorios') {
        const bloco = document.getElementById('prof-relatorios');
        if(bloco.parentElement.id !== 'tela-prof') {
             document.getElementById('tela-prof').appendChild(bloco);
        }
        carregarSelectTurmasRelatorio();
    }
    if(aba==='turmas') carregarTurmasProf(); 
    if(aba==='quiz') carregarCheckboxesTurmas(); 
}

// Funções Prof (Turmas, Alunos, Quiz) - Mesmas de antes
async function carregarTurmasProf() {
    const res = await fetch(`${API}/turmas/${usuario.id}`);
    const turmas = await res.json();
    const div = document.getElementById('lista-turmas-prof'); div.innerHTML = '';
    turmas.forEach(t => div.innerHTML += `<div class="card"><b>🏫 ${t.nome}</b><button class="secondary" onclick="gerirTurma(${t.id}, '${t.nome}')">Alunos</button></div>`);
}
async function criarTurmaPadrao() {
    const nome = `${document.getElementById('selAnoEscolar').value} ${document.getElementById('selTurmaLetra').value} - ${document.getElementById('selAnoLetivo').value}`;
    await fetch(`${API}/turmas`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, professor_id:usuario.id})});
    carregarTurmasProf();
}
async function gerirTurma(id, nome) {
    turmaSelId = id; document.getElementById('gestao-alunos').classList.remove('hidden'); document.getElementById('turmaNomeSel').innerText=nome;
    const res = await fetch(`${API}/turma/${id}/alunos`); const alunos = await res.json();
    const lista = document.getElementById('lista-alunos-turma'); lista.innerHTML = '';
    alunos.forEach(a => lista.innerHTML += `<div class="${a.ativo?'card':'card inactive-student'}" style="padding:10px;"><span>🎓 ${a.nome} (CGM: ${a.cgm})</span><button onclick="toggleStatusAluno(${a.id}, ${a.ativo})" class="${a.ativo?'btn-red':'btn-green'}" style="width:auto;padding:5px;">${a.ativo?'Desativar':'Reativar'}</button></div>`);
}
async function addAluno() {
    const nome=document.getElementById('novoAlunoNome').value, cgm=document.getElementById('novoAlunoCGM').value, senha=document.getElementById('novoAlunoSenha').value;
    if(!nome||!cgm||!senha) return alert("Preencha tudo");
    const res = await fetch(`${API}/aluno`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome,cgm,senha,turma_id:turmaSelId})});
    if(res.ok) { alert("Aluno Matriculado!"); document.getElementById('novoAlunoNome').value=''; document.getElementById('novoAlunoCGM').value=''; gerirTurma(turmaSelId, document.getElementById('turmaNomeSel').innerText); } else alert("CGM já existe!");
}
async function toggleStatusAluno(id, ativo) { await fetch(`${API}/aluno/${id}/status`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ativo: ativo?0:1})}); gerirTurma(turmaSelId, document.getElementById('turmaNomeSel').innerText); }
async function carregarCheckboxesTurmas() {
    const res = await fetch(`${API}/turmas/${usuario.id}`); const turmas = await res.json();
    const div = document.getElementById('checkbox-turmas'); div.innerHTML='';
    turmas.forEach(t => div.innerHTML += `<label style="background:#eee; padding:5px 10px; border-radius:5px;"><input type="checkbox" class="turma-check" value="${t.id}"> ${t.nome}</label>`);
}
function addPerguntaCache() {
    const enunciado=document.getElementById('qEnunciado').value, alts=[0,1,2,3].map(i=>document.getElementById(`qAlt${i}`).value), correta=document.getElementById('qCorreta').value;
    if(!enunciado||alts.some(a=>!a)) return alert("Preencha tudo");
    perguntasCache.push({enunciado, alt0:alts[0], alt1:alts[1], alt2:alts[2], alt3:alts[3], correta:parseInt(correta)});
    document.getElementById('countPerguntas').innerText=perguntasCache.length; document.getElementById('qEnunciado').value=''; [0,1,2,3].forEach(i=>document.getElementById(`qAlt${i}`).value='');
}
async function salvarQuizFinal() {
    const titulo=document.getElementById('quizTitulo').value, max=document.getElementById('quizMaxTentativas').value, turmas=Array.from(document.querySelectorAll('.turma-check:checked')).map(c=>c.value);
    if(!titulo||perguntasCache.length==0||turmas.length==0) return alert("Incompleto");
    await fetch(`${API}/quiz`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({titulo, criador_id:usuario.id, max_tentativas:max, turmas_ids:turmas, perguntas:perguntasCache})});
    alert("Quiz Publicado!"); location.reload();
}

// RELATÓRIOS
async function carregarSelectTurmasRelatorio() {
    // Pega o ID correto (se for admin vendo, pega o do select, se for prof, pega o dele)
    let targetId = usuario.id; 
    // Se o bloco foi movido para area admin e o usuario é admin, o usuario.id ja foi trocado na funcao wrapper
    
    const res = await fetch(`${API}/turmas/${targetId}`);
    const turmas = await res.json();
    const sel = document.getElementById('relTurmaSel'); sel.innerHTML = '<option value="">Selecione...</option>';
    turmas.forEach(t => sel.innerHTML += `<option value="${t.id}">${t.nome}</option>`);
}
async function carregarQuizzesDaTurmaRelatorio() {
    const turmaId = document.getElementById('relTurmaSel').value; const selQuiz = document.getElementById('relQuizSel');
    if(!turmaId) { selQuiz.innerHTML='<option>Selecione...</option>'; selQuiz.disabled=true; return; }
    // Precisamos saber o professor dono dessa turma para pegar os quizzes dele
    // Simplificação: Pegamos todos os quizzes do criador atual
    const res = await fetch(`${API}/prof/${usuario.id}/quizzes`); const quizzes = await res.json();
    selQuiz.innerHTML = '<option value="">Todos</option>'; quizzes.forEach(q => selQuiz.innerHTML += `<option value="${q.id}">${q.titulo}</option>`); selQuiz.disabled=false;
}
async function gerarRelatorio() {
    const turmaId=document.getElementById('relTurmaSel').value, tipo=document.getElementById('relTipoSel').value, quizId=document.getElementById('relQuizSel').value;
    const area=document.getElementById('area-impressao'), tbody=document.getElementById('tbody-relatorio'), thead=document.getElementById('thead-relatorio');
    if(!turmaId) return alert("Selecione a turma");
    area.classList.remove('hidden'); tbody.innerHTML='';
    if(tipo==='geral') {
        document.getElementById('titulo-relatorio').innerText="Boletim Geral"; document.getElementById('subtitulo-relatorio').innerText="Notas Recentes"; thead.innerHTML=`<tr><th>Aluno</th><th>Quiz</th><th>Nota</th><th>Situação</th></tr>`;
        const res=await fetch(`${API}/relatorio/turma/${turmaId}`); const dados=await res.json();
        dados.forEach(d=>{const nota=d.maior_nota!==null?d.maior_nota:'-'; const sit=nota>=60?'<b style="color:green">Apv</b>':(nota==='-'?'Pendente':'<b style="color:red">Rep</b>'); tbody.innerHTML+=`<tr><td>${d.aluno}</td><td>${d.quiz}</td><td>${nota}</td><td>${sit}</td></tr>`;});
    } else {
        if(!quizId) return alert("Selecione o Quiz"); document.getElementById('titulo-relatorio').innerText="Análise de Erros"; thead.innerHTML=`<tr><th>Questão</th><th>Resp.</th><th>Erros</th><th>%</th></tr>`;
        const res=await fetch(`${API}/relatorio/analise/${turmaId}/${quizId}`); const dados=await res.json();
        dados.forEach(d=>{const pct=Math.round((d.total_erros/d.total_respostas)*100); tbody.innerHTML+=`<tr><td>${d.enunciado}</td><td>${d.total_respostas}</td><td>${d.total_erros}</td><td>${pct}%</td></tr>`;});
    }
}

// ALUNO & JOGO (Mesmo de antes)
function carregarAluno() { mostrar('tela-aluno'); document.getElementById('alunoNome').innerText=usuario.nome; verQuizzesAluno(); }
async function verQuizzesAluno() { document.getElementById('area-boletim-aluno').classList.add('hidden'); document.getElementById('area-quizzes-aluno').classList.remove('hidden'); const res = await fetch(`${API}/aluno/${usuario.id}/quizzes`); const quizzes = await res.json(); document.getElementById('area-quizzes-aluno').innerHTML = quizzes.map(q => `<div class="card" style="flex-direction:column;align-items:start;"><h3>📝 ${q.titulo}</h3><p>Tentativas: ${q.max_tentativas==0?'Infinitas':q.tentativas_feitas+'/'+q.max_tentativas}</p>${(q.max_tentativas==0||q.tentativas_feitas<q.max_tentativas)?`<button class="btn-green" onclick="jogar(${q.id})">JOGAR</button>`:'<button disabled style="background:#ccc">Esgotado</button>'}</div>`).join(''); }
async function verBoletimAluno() { document.getElementById('area-quizzes-aluno').classList.add('hidden'); document.getElementById('area-boletim-aluno').classList.remove('hidden'); const res = await fetch(`${API}/aluno/${usuario.id}/boletim`); const dados = await res.json(); document.getElementById('tabela-notas-aluno').innerHTML = dados.map(d => `<tr><td>${new Date(d.data_tentativa).toLocaleDateString()}</td><td>${d.titulo}</td><td><b>${d.nota}</b></td></tr>`).join(''); }
let quizAtual=null, indice=0, acertos=0, erros=0;
async function jogar(id) { mostrar('tela-jogo'); const res=await fetch(`${API}/quiz/${id}`); quizAtual=await res.json(); indice=0; acertos=0; erros=0; detalhesTentativa=[]; renderPergunta(); }
function renderPergunta() { const p=quizAtual.perguntas[indice]; document.getElementById('jogo-pergunta').innerText=p.enunciado; const div=document.getElementById('jogo-opcoes'); div.innerHTML=''; [p.alt0,p.alt1,p.alt2,p.alt3].forEach((t,i) => { const b=document.createElement('button'); b.className='secondary'; b.innerText=t; b.style.width='100%'; b.onclick=()=>check(i); div.appendChild(b); }); }
function check(i) { const p=quizAtual.perguntas[indice]; const modal=document.getElementById('feedback-overlay'); const content=document.getElementById('feedback-content'); modal.style.display='flex'; const acertou=(i===p.correta); detalhesTentativa.push({pergunta_id:p.id, escolha:i, acertou:acertou}); if(acertou) { acertos++; document.getElementById('feed-titulo').innerText="ACERTOU!"; document.getElementById('feed-img').src="imagens/images.jpeg"; content.className='msg-acerto'; } else { erros++; document.getElementById('feed-titulo').innerText="ERROU!"; document.getElementById('feed-img').src="imagens/seumadruga.jpg"; content.className='msg-erro'; } }
async function proximaPergunta() { document.getElementById('feedback-overlay').style.display='none'; indice++; if(indice<quizAtual.perguntas.length) renderPergunta(); else { const nota=Math.round((acertos/quizAtual.perguntas.length)*100); await fetch(`${API}/tentativa`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({aluno_id:usuario.id, quiz_id:quizAtual.id, nota, acertos, erros, detalhes:detalhesTentativa})}); alert(`FIM! Nota: ${nota}`); location.reload(); } }