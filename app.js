window.onerror = function(msg, url, lineNo) {
    const loadingMsg = document.getElementById("loading-message");
    if(loadingMsg) {
        loadingMsg.innerHTML = `⚠️ エラーが発生しました。<br>詳細: ${msg}`;
        loadingMsg.style.color = "red";
    }
    return false;
};

let allQuestions = [];
let typeFilteredQuestions = [];  
let finalQuestions = [];         
let currentType = "";
let currentIndex = 0;
let correctCount = 0;
let totalPossibleScore = 0;

// ★追加：出題確率を重要度でコントロールする（加重ランダム抽選）
function pickWeightedRandom(questions, count) {
    if (questions.length === 0) return [];
    let pool = [];
    
    questions.forEach(q => {
        // 重要度に応じて抽選箱に入れるチケットの枚数を変える（★5は★1の10倍出やすい）
        let tickets = 1;
        if (q.star === 5) tickets = 10;
        else if (q.star === 4) tickets = 6;
        else if (q.star === 3) tickets = 3;
        else if (q.star === 2) tickets = 1;
        
        for (let i = 0; i < tickets; i++) {
            pool.push(q);
        }
    });
    
    let selected = [];
    let maxPossible = new Set(questions).size; 
    let targetCount = Math.min(count, maxPossible);

    while (selected.length < targetCount) {
        let randomIndex = Math.floor(Math.random() * pool.length);
        let chosen = pool[randomIndex];
        // まだ選ばれていない問題なら追加する
        if (!selected.includes(chosen)) {
            selected.push(chosen);
        }
    }
    return selected;
}

function calculateTotalScore() {
    totalPossibleScore = 0;
    finalQuestions.forEach(q => {
        if (q.type.includes("穴埋め")) {
            totalPossibleScore += Object.keys(q.answers).length;
        } else {
            totalPossibleScore += 1;
        }
    });
}

// 1. CSVデータの読み込み
async function loadQuestions() {
    try {
        const response = await fetch('questions.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                try {
                    allQuestions = results.data.map((row, index) => {
                        let answers = {};
                        for (let i = 1; i <= 10; i++) {
                            if (row[`ans${i}`]) { answers[i.toString()] = row[`ans${i}`]; }
                        }

                        let type = row.type || "穴埋め";
                        let category = row.category || "その他";
                        let source = row.source || "基準未設定";
                        let title = row.title || `問題 ${index+1}`;
                        let text = row.text || ""; 
                        let rawQuestion = row.Question || row.question || row['Question\r'] || "";
                        let questionText = rawQuestion.trim() !== "" ? rawQuestion : title;
                        let answerText = row.Answerstext || row.AnswerText || row.Answer || ""; 
                        let questionId = row['問題コード'] || row['コード'] || row.id || row['ID'] || `Q-${String(index + 1).padStart(3, '0')}`;
                        
                        // ★追加：重要度(Star)の読み込み
                        let rawStar = row['Star'] || row['star'] || row['重要度'] || "3";
                        let starVal = Number(rawStar);
                        if (isNaN(starVal) || starVal < 1) starVal = 1;
                        if (starVal > 5) starVal = 5;

                        return {
                            id: questionId,
                            type: type,
                            category: category,
                            source: source,
                            title: title,
                            text: text,
                            questionText: questionText,
                            answers: answers,
                            answerText: answerText,
                            star: starVal // ★星の数を保存
                        };
                    }).filter(q => q.text !== "" || q.questionText !== ""); 
                    
                    allQuestions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
                    setupTypeScreen();

                } catch (parseError) {
                    document.getElementById("loading-message").innerHTML = `⚠️ データ処理エラー: ${parseError.message}`;
                }
            }
        });
    } catch (error) {
        document.getElementById("loading-message").innerHTML = `⚠️ データの読み込みに失敗しました。`;
    }
}

// 2. モード選択画面の生成
function setupTypeScreen() {
    const types = [...new Set(allQuestions.map(q => q.type))];
    const buttonsContainer = document.getElementById("type-buttons");
    buttonsContainer.innerHTML = ""; 
    document.getElementById("total-q-badge").textContent = `収録問題数: ${allQuestions.length} 問`;

    types.forEach(type => {
        const count = allQuestions.filter(q => q.type === type).length;
        
        let icon = "📝";
        let desc = "問題を解いて実力をチェックします。";
        if (type.includes("穴埋め")) {
            icon = "🧩";
            desc = "空欄を埋めて、試験で頻出のキーワードを正確に暗記します。";
        } else if (type.includes("記述") || type.includes("一問一答")) {
            icon = "✍️";
            desc = "表示される問題に対して解答を作成し、自己採点を行います。";
        }

        const card = document.createElement("div");
        card.className = "type-card";
        card.innerHTML = `
            <div class="type-icon">${icon}</div>
            <h3 class="type-title">${type}対策</h3>
            <p class="type-desc">${desc}</p>
            <div class="type-count">全 ${count} 問収録</div>
        `;
        card.onclick = () => selectType(type); 
        buttonsContainer.appendChild(card);
    });

    const randCard = document.createElement("div");
    randCard.className = "type-card";
    randCard.style.borderColor = "#f59e0b"; 
    randCard.innerHTML = `
        <div class="type-icon" style="background:#fef3c7;">🔥</div>
        <h3 class="type-title">総合ランダムテスト</h3>
        <p class="type-desc">全範囲・全形式からランダムで10問出題します。本番さながらの実力試しに最適です。</p>
        <div class="type-count">10問出題</div>
    `;
    randCard.onclick = () => startRandom10(false); 
    buttonsContainer.appendChild(randCard);

    // ★追加：頻出・重要特化ランダムテスト
    const highStarRandCard = document.createElement("div");
    highStarRandCard.className = "type-card";
    highStarRandCard.style.borderColor = "#f43f5e"; 
    highStarRandCard.innerHTML = `
        <div class="type-icon" style="background:#ffe4e6;">⭐️</div>
        <h3 class="type-title">頻出・重要ランダム</h3>
        <p class="type-desc">全範囲の中から、重要度が高い（★4以上）問題のみをランダムで10問出題します。</p>
        <div class="type-count">10問出題</div>
    `;
    highStarRandCard.onclick = () => startRandom10(true); 
    buttonsContainer.appendChild(highStarRandCard);

    document.getElementById("loading-message").style.display = "none";
    document.getElementById("type-container").style.display = "block";
}

// 全範囲ランダム10問（引数で★4以上のみを制御）
function startRandom10(isHighStarOnly) {
    let pool = allQuestions;
    if (isHighStarOnly) {
        pool = allQuestions.filter(q => q.star >= 4);
    }
    
    if (pool.length === 0) {
        alert("★4以上の問題が登録されていません。");
        return;
    }

    // ★単なるシャッフルではなく、重み付けランダムを使用
    finalQuestions = pickWeightedRandom(pool, 10);
    currentIndex = 0;
    correctCount = 0; 
    calculateTotalScore(); 

    document.getElementById("start-screen").style.display = "none";
    document.getElementById("category-screen").style.display = "none";
    document.getElementById("quiz-screen").style.display = "block";
    document.getElementById("current-category-badge").textContent = isHighStarOnly ? "頻出・重要(★4以上)" : "総合テスト(全範囲)";

    displayQuestion();
}

// 3. カテゴリー選択画面の生成
function selectType(selectedType) {
    currentType = selectedType;
    typeFilteredQuestions = allQuestions.filter(q => q.type === currentType);
    
    document.getElementById("selected-type-title").textContent = `${currentType}対策`;

    const categories = [...new Set(typeFilteredQuestions.map(q => q.category))];
    const buttonsContainer = document.getElementById("category-buttons");
    buttonsContainer.innerHTML = ""; 

    categories.forEach(category => {
        const catCount = typeFilteredQuestions.filter(q => q.category === category).length;
        
        const div = document.createElement("div");
        div.className = "category-item";
        
        const btnMain = document.createElement("button");
        btnMain.className = "btn-category-main";
        btnMain.textContent = `${category} (${catCount}問)`;
        btnMain.onclick = () => startCategory(category, false); 
        div.appendChild(btnMain);
        
        if (catCount >= 5) {
            const btnRand = document.createElement("button");
            btnRand.className = "btn-category-rand";
            btnRand.innerHTML = "🎲 5問";
            btnRand.onclick = () => startCategory(category, true);
            div.appendChild(btnRand);
        }

        buttonsContainer.appendChild(div);
    });

    document.getElementById("start-screen").style.display = "none";
    document.getElementById("category-screen").style.display = "block";
}

function backToTypeSelect() {
    document.getElementById("category-screen").style.display = "none";
    document.getElementById("start-screen").style.display = "block";
}

function backToCategorySelect() {
    document.getElementById("quiz-screen").style.display = "none";
    document.getElementById("result-screen").style.display = "none";
    document.getElementById("start-screen").style.display = "block"; 
}

window.onload = loadQuestions;

// 4. クイズ開始
function startCategory(selectedCategory, isRandom5) {
    let filtered = typeFilteredQuestions.filter(q => q.category === selectedCategory);
    
    // ★追加：重要度★4以上チェックボックスの判定
    const starCheckbox = document.getElementById("high-star-checkbox");
    const isHighStarOnly = starCheckbox ? starCheckbox.checked : false;

    if (isHighStarOnly) {
        filtered = filtered.filter(q => q.star >= 4);
    }

    if (filtered.length === 0) {
        alert("このカテゴリーには★4以上の問題がありません。");
        return;
    }
    
    if (isRandom5) {
        // 重み付けランダムで5問抽出
        filtered = pickWeightedRandom(filtered, 5);
    }
    
    finalQuestions = filtered;
    currentIndex = 0;
    correctCount = 0; 
    calculateTotalScore(); 

    let badgeText = selectedCategory;
    if (isHighStarOnly) badgeText += " (★4以上)";
    if (isRandom5) badgeText += " (ランダム)";

    document.getElementById("category-screen").style.display = "none";
    document.getElementById("quiz-screen").style.display = "block";
    document.getElementById("current-category-badge").textContent = badgeText;

    displayQuestion();
}

// 5. 問題の表示
function displayQuestion() {
    const currentQ = finalQuestions[currentIndex];
    
    document.getElementById("question-title").textContent = currentQ.title;
    document.getElementById("progress-text").textContent = `${currentIndex + 1} / ${finalQuestions.length} 問目`;
    
    // ★追加：重要度を★マークで表示
    const starText = "★".repeat(currentQ.star) + "☆".repeat(5 - currentQ.star);
    document.getElementById("question-star-display").textContent = starText;
    
    document.getElementById("question-source-display").textContent = `【${currentQ.source}】 Code:${currentQ.id}`;
    
    const progressPercent = ((currentIndex) / finalQuestions.length) * 100;
    document.getElementById("progress-bar").style.width = `${progressPercent}%`;

    const descInput = document.getElementById("desc-input-area");
    if(descInput) {
        descInput.value = "";
        descInput.disabled = false; 
    }

    if (currentQ.type.includes("穴埋め")) {
        let htmlText = currentQ.text;
        for (let key in currentQ.answers) {
            const inputHTML = `<input type="text" id="input-${key}" autocomplete="off">`;
            htmlText = htmlText.split(`[${key}]`).join(inputHTML);
        }
        document.getElementById("question-text").innerHTML = htmlText;
        
        document.getElementById("fill-in-area").style.display = "block";
        document.getElementById("fill-in-answer-box").style.display = "none";
        document.getElementById("result-message").textContent = "";
        
        document.getElementById("check-btn").disabled = false;
        document.getElementById("show-fill-in-answer-btn").disabled = false; 

        document.getElementById("desc-area").style.display = "none";
        document.getElementById("self-grade-action").style.display = "none";
        document.getElementById("self-grade-area").style.display = "none";

    } else {
        document.getElementById("question-text").innerHTML = currentQ.questionText;
        document.getElementById("answer-text").innerHTML = currentQ.answerText;
        
        document.getElementById("fill-in-area").style.display = "none";
        
        document.getElementById("desc-area").style.display = "block";
        document.getElementById("self-grade-action").style.display = "block";
        document.getElementById("self-grade-area").style.display = "none";
    }

    document.getElementById("prev-btn").disabled = (currentIndex === 0);
    const nextBtn = document.getElementById("next-btn");
    if (currentIndex === finalQuestions.length - 1) {
        nextBtn.textContent = "結果を見る ▶";
        nextBtn.className = "btn-primary";
    } else {
        nextBtn.textContent = "次へ ▶";
        nextBtn.className = "btn-secondary";
    }
}

// 6-A. 穴埋めモードの処理
function checkFillInAnswers() {
    const currentQ = finalQuestions[currentIndex];
    
    if (document.getElementById("check-btn").disabled) return;

    let correctInThisQuestion = 0; 
    let totalInThisQuestion = Object.keys(currentQ.answers).length; 

    for (let key in currentQ.answers) {
        const inputElement = document.getElementById(`input-${key}`);
        if(!inputElement) continue;

        const userInput = inputElement.value.trim();
        const correctAnswer = currentQ.answers[key];

        inputElement.classList.remove("input-correct", "input-incorrect");

        if (userInput === correctAnswer) {
            inputElement.classList.add("input-correct");
            correctInThisQuestion++; 
        } else {
            inputElement.classList.add("input-incorrect");
        }
    }

    correctCount += correctInThisQuestion;

    const resultMessage = document.getElementById("result-message");
    if (correctInThisQuestion === totalInThisQuestion) {
        resultMessage.textContent = "🎉 パーフェクト！全問正解！";
        resultMessage.style.color = "var(--correct)";
    } else {
        resultMessage.textContent = `惜しい！ ${totalInThisQuestion}箇所中、${correctInThisQuestion}箇所正解です。`;
        resultMessage.style.color = "var(--incorrect)";
    }

    document.getElementById("check-btn").disabled = true;
    
    if (currentIndex === finalQuestions.length - 1) {
        document.getElementById("progress-bar").style.width = "100%";
    }
}

function showFillInAnswer() {
    const currentQ = finalQuestions[currentIndex];
    
    let answerContent = "<strong style='color: var(--primary);'>【正解】</strong><br>";
    for (let key in currentQ.answers) {
        answerContent += `[${key}]： ${currentQ.answers[key]}<br>`;
    }

    if (currentQ.answerText) {
        answerContent += `<br><strong style='color: var(--text-main);'>【解説・全文】</strong><br>${currentQ.answerText}`;
    }

    document.getElementById("fill-in-answer-text").innerHTML = answerContent;
    document.getElementById("fill-in-answer-box").style.display = "block";

    if (!document.getElementById("check-btn").disabled) {
        const resultMessage = document.getElementById("result-message");
        resultMessage.textContent = "解答を表示しました。（この問題は0点扱いになります）";
        resultMessage.style.color = "var(--text-muted)";
        document.getElementById("check-btn").disabled = true;
    }
    
    document.getElementById("show-fill-in-answer-btn").disabled = true;
}

// 6-B. 記述（一問一答）モードの処理
function showAnswer() {
    document.getElementById("self-grade-action").style.display = "none";
    document.getElementById("self-grade-area").style.display = "block";
    
    const descInput = document.getElementById("desc-input-area");
    if(descInput) descInput.disabled = true; 
}

function gradeAnswer(isCorrect) {
    if (isCorrect) {
        correctCount++;
    }
    nextQuestion(); 
}

// 7. 画面遷移
function nextQuestion() {
    if (currentIndex < finalQuestions.length - 1) {
        currentIndex++;
        displayQuestion();
    } else {
        showResultScreen();
    }
}

function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        displayQuestion();
    }
}

function showResultScreen() {
    document.getElementById("quiz-screen").style.display = "none";
    document.getElementById("result-screen").style.display = "block";
    
    document.getElementById("score-display").textContent = `${correctCount} / ${totalPossibleScore}`;
    
    let accuracy = 0;
    if (totalPossibleScore > 0) {
        accuracy = Math.round((correctCount / totalPossibleScore) * 100);
    }
    document.getElementById("accuracy-display").textContent = `正答率: ${accuracy}%`;
    
    document.getElementById("progress-bar").style.width = "100%";
}
// ※プログラムの最終行です。この下には何も書かないでください。