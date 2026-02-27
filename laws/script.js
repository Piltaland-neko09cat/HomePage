const ORG = "Piltaland-neko09cat";
const TOPIC = "piltaland-laws";

// リポジトリ情報を保存
const repoMetadata = new Map();

// 共通のID生成関数
function generateHeadingId(text) {
    // HTMLタグを除去
    const cleanText = String(text).replace(/<[^>]*>/g, '');

    // ID生成：小文字化、許可された文字以外を削除、スペースをハイフンに、連続ハイフンを1つに、前後のハイフンを削除
    const id = cleanText.toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s-]/g, '') // 許可文字以外削除
        .trim() // 前後の空白削除
        .replace(/\s+/g, '-') // スペースをハイフンに
        .replace(/-+/g, '-') // 連続ハイフンを1つに
        .replace(/^-+|-+$/g, ''); // 前後のハイフンを削除

    return id;
}

// markedの設定
marked.setOptions({
    headerIds: true,
    mangle: false,
    breaks: true
});

// カスタムレンダラー：見出しにアンカーリンクを追加
const renderer = new marked.Renderer();

renderer.heading = function (textOrToken, level, raw) {
    // marked.js の新旧バージョン両方に対応
    let text, actualLevel, actualRaw;

    // 新しいバージョン（オブジェクト形式）
    if (typeof textOrToken === 'object' && textOrToken !== null && textOrToken.text !== undefined) {
        text = textOrToken.text;
        actualLevel = textOrToken.depth || textOrToken.level || level;
        actualRaw = textOrToken.raw;
    }
    // 古いバージョン（個別引数）
    else {
        text = textOrToken;
        actualLevel = level;
        actualRaw = raw;
    }

    // ID生成用にrawテキスト（プレーンテキスト）を使用
    const rawText = actualRaw || text || '';
    const id = generateHeadingId(rawText);

    // textは既にHTMLレンダリング済みなのでそのまま使用
    return `<h${actualLevel} id="${id}">
        ${text}
        <a href="#${id}" class="heading-anchor" aria-label="Link to this section">#</a>
    </h${actualLevel}>`;
};

marked.setOptions({ renderer: renderer });

// 目次を生成
function generateTOC(markdown) {
    const lines = markdown.split('\n');
    const headings = [];

    lines.forEach(line => {
        const match = line.match(/^(#{1,4})\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            const text = match[2].trim();
            const id = generateHeadingId(text);

            headings.push({ level, text, id });
        }
    });

    if (headings.length === 0) return '';

    let tocHTML = '<div class="table-of-contents"><h3>📋 目次</h3><ul>';

    headings.forEach(heading => {
        tocHTML += `<li class="toc-h${heading.level}">
            <a href="#${heading.id}">${heading.text}</a>
        </li>`;
    });

    tocHTML += '</ul></div>';
    return tocHTML;
}

async function init() {
    const listEl = document.getElementById('law-list');
    try {
        // 1. 指定トピックが付いたリポジトリをGitHub APIで検索
        const res = await fetch(`https://api.github.com/search/repositories?q=org:${ORG}+topic:${TOPIC}`);
        const data = await res.json();

        if (data.items.length === 0) {
            listEl.innerHTML = "対象のリポジトリが見つかりません。";
            return;
        }

        listEl.innerHTML = "";

        for (const repo of data.items) {
            // リポジトリのメタデータを保存
            repoMetadata.set(repo.name, {
                name: repo.name,
                description: repo.description,
                fullName: repo.full_name
            });

            const group = document.createElement('div');
            group.className = 'law-group';
            group.setAttribute('data-repo', repo.name);

            // リポジトリ名部分（クリックでREADMEを表示）
            const repoLink = document.createElement('a');
            repoLink.className = 'repo-title';
            repoLink.innerText = `⚖️ ${repo.description || repo.name}`;
            repoLink.setAttribute('data-repo', repo.name);
            repoLink.setAttribute('data-file', 'README.md');
            repoLink.onclick = (e) => { e.preventDefault(); loadMarkdown(repo.name, 'README.md'); };
            group.appendChild(repoLink);

            // 2. そのリポジトリ内の全ファイルを取得
            const filesRes = await fetch(`https://api.github.com/repos/${ORG}/${repo.name}/contents/`);
            const files = await filesRes.json();

            // README以外のMarkdownファイルをリストアップ
            files.filter(f => f.name.endsWith('.md') && f.name !== 'README.md').forEach(file => {
                const a = document.createElement('a');
                a.className = 'file-link';
                a.innerText = `📜 ${file.name.replace('.md', '')}`;
                a.href = "#";
                a.setAttribute('data-repo', repo.name);
                a.setAttribute('data-file', file.name);
                a.onclick = (e) => {
                    e.preventDefault();
                    loadMarkdown(repo.name, file.name);
                };
                group.appendChild(a);
            });
            listEl.appendChild(group);
        }

        // 初期ロード時：URLパラメータから復元
        const urlParams = new URLSearchParams(window.location.search);
        const repoParam = urlParams.get('repo');
        const fileParam = urlParams.get('file');

        if (repoParam && fileParam) {
            // URLパラメータで指定されたMarkdownをロード
            loadMarkdown(repoParam, fileParam);
        }
    } catch (e) {
        console.error(e);
        listEl.innerText = "読み込みエラー。API制限の可能性があります。";
    }
}

// ハッシュに基づいてスクロールする関数
function scrollToHash(hash) {
    if (!hash) return;

    // '#' を除去してデコード
    const id = decodeURIComponent(hash.substring(1));

    // 複数回試行（DOMのレンダリング待ち）
    let attempts = 0;
    const maxAttempts = 10;

    const tryScroll = () => {
        const target = document.getElementById(id);
        if (target) {
            // 要素が見つかったらスクロール
            requestAnimationFrame(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return true;
        } else if (attempts < maxAttempts) {
            // 見つからない場合は再試行
            attempts++;
            setTimeout(tryScroll, 100);
            return false;
        } else {
            // 最大試行回数に到達
            return false;
        }
    };

    tryScroll();
}

// 初回ロードフラグ
let isInitialLoad = true;

// サイドバーの選択状態を更新
function updateSidebarSelection(repo, file) {
    // すべてのアクティブクラスを削除
    document.querySelectorAll('.repo-title.active, .file-link.active').forEach(el => {
        el.classList.remove('active');
    });

    // 該当するリンクにアクティブクラスを追加
    const targetLink = document.querySelector(
        `[data-repo="${repo}"][data-file="${file}"]`
    );
    if (targetLink) {
        targetLink.classList.add('active');
    }
}

// ページタイトルを更新
function updatePageTitle(repo, file) {
    const metadata = repoMetadata.get(repo);
    const lawName = metadata ? metadata.description || metadata.name : repo;
    const fileName = file === 'README.md' ? '' : ` - ${file.replace('.md', '')}`;

    // ブラウザのタイトルを更新
    document.title = `${lawName}${fileName} | Piltaland 法令ポータル`;

    // サイドバーの現在の法令名を更新
    const currentLawEl = document.getElementById('current-law');
    if (currentLawEl) {
        currentLawEl.textContent = `📖 ${lawName}${fileName}`;
    }
}

// 3. GitHubからRawデータを取得して表示
async function loadMarkdown(repo, file, skipHistoryUpdate = false) {
    const contentEl = document.getElementById('content');
    contentEl.innerHTML = "<p style='text-align:center;'>読み込み中...</p>";

    try {
        const res = await fetch(`https://raw.githubusercontent.com/${ORG}/${repo}/main/${file}`);
        if (!res.ok) throw new Error();
        const md = await res.text();

        // サイドバーの選択状態を更新
        updateSidebarSelection(repo, file);

        // ページタイトルを更新
        updatePageTitle(repo, file);

        // URLパラメータを更新（初回は置換、以降は履歴追加）
        if (!skipHistoryUpdate) {
            const currentHash = window.location.hash;
            const newUrl = `${window.location.pathname}?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}${currentHash}`;

            if (isInitialLoad) {
                window.history.replaceState({ repo, file }, '', newUrl);
                isInitialLoad = false;
            } else {
                window.history.pushState({ repo, file }, '', newUrl);
            }
        }

        // 目次を生成
        const toc = generateTOC(md);

        // Markdownレンダリング
        const renderedHTML = marked.parse(md);
        contentEl.innerHTML = toc + renderedHTML;

        // URLにハッシュがある場合、そのセクションにスクロール
        if (window.location.hash) {
            scrollToHash(window.location.hash);
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (e) {
        console.error(e);
        contentEl.innerHTML = "<h1>エラー</h1><p>ファイルの取得に失敗しました。メインブランチ名が 'main' であることを確認してください。</p>";
    }
}

// ハッシュ変更時のスムーズスクロール
window.addEventListener('hashchange', function () {
    if (window.location.hash) {
        scrollToHash(window.location.hash);
    }
});

// ブラウザの戻る/進むボタンで状態を復元
window.addEventListener('popstate', function (event) {
    if (event.state && event.state.repo && event.state.file) {
        // 履歴更新をスキップして読み込み
        loadMarkdown(event.state.repo, event.state.file, true);
    }
});

// ページロード完了時にハッシュがあればスクロール
window.addEventListener('DOMContentLoaded', function () {
    if (window.location.hash) {
        // 少し遅延させてDOMが完全にレンダリングされるのを待つ
        setTimeout(() => {
            scrollToHash(window.location.hash);
        }, 500);
    }
});

init();
