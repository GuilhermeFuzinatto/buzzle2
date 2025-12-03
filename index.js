const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(bodyParser.json());

const db = new sqlite3.Database('./buzzle.db');

db.serialize(() => {
    // Tabelas Base
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, email TEXT, cgm TEXT UNIQUE, senha TEXT, tipo TEXT, ativo INTEGER DEFAULT 1, turma_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS turmas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, professor_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, criador_id INTEGER, max_tentativas INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS perguntas (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER, enunciado TEXT, correta INTEGER, alt0 TEXT, alt1 TEXT, alt2 TEXT, alt3 TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS quiz_turmas (quiz_id INTEGER, turma_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS tentativas (id INTEGER PRIMARY KEY AUTOINCREMENT, aluno_id INTEGER, quiz_id INTEGER, nota INTEGER, acertos INTEGER, erros INTEGER, data_tentativa DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS respostas_analiticas (id INTEGER PRIMARY KEY AUTOINCREMENT, tentativa_id INTEGER, pergunta_id INTEGER, escolha_aluno INTEGER, correta INTEGER)`);

    // Admin Padrão
    const adminEmail = 'admin@escola.com';
    db.get("SELECT id FROM usuarios WHERE email = ?", [adminEmail], (err, row) => {
        if (!row) db.run(`INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?,?,?,?)`, ['Diretor', adminEmail, 'admin123', 'admin']);
    });
});

// AUTENTICAÇÃO
app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE (email = ? OR cgm = ?) AND senha = ?`, [login, login, senha], (err, row) => {
        if (!row) return res.status(401).json({erro: "Dados inválidos"});
        if (row.ativo === 0) return res.status(403).json({erro: "Conta desativada."});
        res.json(row);
    });
});

// TURMAS E ALUNOS
app.get('/api/turmas/:profId', (req, res) => {
    db.all(`SELECT * FROM turmas WHERE professor_id = ? ORDER BY nome`, [req.params.profId], (err, r) => res.json(r));
});
app.post('/api/turmas', (req, res) => {
    db.run(`INSERT INTO turmas (nome, professor_id) VALUES (?,?)`, [req.body.nome, req.body.professor_id], () => res.json({msg:"Ok"}));
});
app.get('/api/turma/:id/alunos', (req, res) => {
    db.all(`SELECT id, nome, cgm, ativo FROM usuarios WHERE turma_id = ? ORDER BY nome ASC`, [req.params.id], (err, r) => res.json(r));
});
app.post('/api/aluno', (req, res) => {
    db.run(`INSERT INTO usuarios (nome, cgm, senha, tipo, turma_id) VALUES (?,?,?, 'aluno', ?)`, [req.body.nome, req.body.cgm, req.body.senha, req.body.turma_id], (err) => err ? res.status(500).json({erro:"CGM duplicado"}) : res.json({msg:"Ok"}));
});
app.put('/api/aluno/:id/status', (req, res) => {
    db.run(`UPDATE usuarios SET ativo = ? WHERE id = ?`, [req.body.ativo, req.params.id], () => res.json({msg:"Status alterado"}));
});

// QUIZ
app.post('/api/quiz', (req, res) => {
    const { titulo, criador_id, max_tentativas, turmas_ids, perguntas } = req.body;
    db.run(`INSERT INTO quizzes (titulo, criador_id, max_tentativas) VALUES (?,?,?)`, [titulo, criador_id, max_tentativas], function(err) {
        const qId = this.lastID;
        turmas_ids.forEach(tid => db.run(`INSERT INTO quiz_turmas (quiz_id, turma_id) VALUES (?,?)`, [qId, tid]));
        perguntas.forEach(p => db.run(`INSERT INTO perguntas (quiz_id, enunciado, correta, alt0, alt1, alt2, alt3) VALUES (?,?,?,?,?,?,?)`, [qId, p.enunciado, p.correta, p.alt0, p.alt1, p.alt2, p.alt3]));
        res.json({msg:"Ok"});
    });
});

// Endpoint flexível para quizzes de qualquer professor (usado pelo Admin)
app.get('/api/prof/:id/quizzes', (req, res) => {
    db.all(`SELECT * FROM quizzes WHERE criador_id = ?`, [req.params.id], (err, r) => res.json(r));
});

// ALUNO & JOGO
app.get('/api/aluno/:id/quizzes', (req, res) => {
    db.get(`SELECT turma_id FROM usuarios WHERE id=?`, [req.params.id], (err, u) => {
        if(!u) return res.json([]);
        const sql = `SELECT q.*, (SELECT COUNT(*) FROM tentativas WHERE quiz_id=q.id AND aluno_id=?) as tentativas_feitas FROM quizzes q JOIN quiz_turmas qt ON q.id=qt.quiz_id WHERE qt.turma_id=?`;
        db.all(sql, [req.params.id, u.turma_id], (err, r) => res.json(r));
    });
});
app.get('/api/quiz/:id', (req, res) => {
    db.get(`SELECT * FROM quizzes WHERE id=?`, [req.params.id], (err, q) => {
        db.all(`SELECT * FROM perguntas WHERE quiz_id=?`, [req.params.id], (err, p) => res.json({...q, perguntas:p}));
    });
});
app.post('/api/tentativa', (req, res) => {
    const { aluno_id, quiz_id, nota, acertos, erros, detalhes } = req.body;
    db.run(`INSERT INTO tentativas (aluno_id, quiz_id, nota, acertos, erros) VALUES (?,?,?,?,?)`, [aluno_id, quiz_id, nota, acertos, erros], function(err) {
            const tentId = this.lastID;
            if(detalhes && detalhes.length > 0) {
                const stmt = db.prepare(`INSERT INTO respostas_analiticas (tentativa_id, pergunta_id, escolha_aluno, correta) VALUES (?,?,?,?)`);
                detalhes.forEach(d => stmt.run(tentId, d.pergunta_id, d.escolha, d.acertou ? 1 : 0));
                stmt.finalize();
            }
            res.json({msg:"Ok"});
    });
});

// RELATÓRIOS
app.get('/api/relatorio/turma/:id', (req, res) => {
    const sql = `SELECT u.nome as aluno, q.titulo as quiz, MAX(t.nota) as maior_nota FROM usuarios u JOIN quiz_turmas qt ON u.turma_id = qt.turma_id JOIN quizzes q ON qt.quiz_id = q.id LEFT JOIN tentativas t ON u.id = t.aluno_id AND q.id = t.quiz_id WHERE u.turma_id = ? AND u.tipo = 'aluno' GROUP BY u.id, q.id ORDER BY u.nome ASC`;
    db.all(sql, [req.params.id], (err, rows) => res.json(rows));
});
app.get('/api/relatorio/analise/:turmaId/:quizId', (req, res) => {
    const sql = `SELECT p.enunciado, COUNT(ra.id) as total_respostas, SUM(CASE WHEN ra.correta = 0 THEN 1 ELSE 0 END) as total_erros FROM perguntas p JOIN respostas_analiticas ra ON p.id = ra.pergunta_id JOIN tentativas t ON ra.tentativa_id = t.id JOIN usuarios u ON t.aluno_id = u.id WHERE u.turma_id = ? AND p.quiz_id = ? GROUP BY p.id ORDER BY total_erros DESC`;
    db.all(sql, [req.params.turmaId, req.params.quizId], (err, rows) => res.json(rows));
});
app.get('/api/aluno/:id/boletim', (req, res) => {
    db.all(`SELECT q.titulo, t.nota, t.acertos, t.data_tentativa FROM tentativas t JOIN quizzes q ON t.quiz_id=q.id WHERE t.aluno_id=? ORDER BY t.data_tentativa DESC`, [req.params.id], (err, r) => res.json(r));
});

// ADMIN
app.post('/api/admin/prof', (req, res) => db.run(`INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?,?,?, 'prof')`, [req.body.nome, req.body.email, req.body.senha], () => res.json({msg:"Ok"})));
app.get('/api/admin/profs', (req, res) => db.all(`SELECT * FROM usuarios WHERE tipo='prof'`, [], (err, r) => res.json(r)));
app.put('/api/admin/prof/:id', (req, res) => db.run(`UPDATE usuarios SET ativo=? WHERE id=?`, [req.body.ativo, req.params.id], () => res.json({msg:"Ok"})));

app.listen(port, () => console.log(`Buzzle V6.1 rodando na porta ${port}`));