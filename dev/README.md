# 開発用の道具

Fogcast を作るときに使った確認用のスクリプトです。Mod 本体には含まれず、配布の zip にも入れません。
パスは作ったときの環境（リポジトリが `/home/claude/fogcast`）を前提にしています。別の場所で使うときは、各ファイルの先頭にある `ROOT`・`PLUGIN`・`LOG` を書き換えてください。

| 場所 | 何をするか | 動かし方 |
|---|---|---|
| `term/run-term.py` | 本物の Claude Code を擬似端末（`pty` + `pyte`）で `--plugin-dir` 付きで起動し、画面の文字を読む。API は `ziptest/` の偽物に向けるので料金はかからない | `python3 dev/term/run-term.py "type:ASK_ME" enter wait:8 show:asked`（手順は `wait:秒`・`show:名前`・`type:文`・`enter`・`key:tab` など。要 `pip install pyte`） |
| `term/run-term.py` の受け皿の手順 | 画面がするのと同じ呼び出しを受け皿に送り、ターミナルの切り替わりを確かめる。`chan`（チャンネルの状態と最近の出来事）・`sessions`（/resume の一覧）・`resume:番号か ID`・`typeresume:番号`（ターミナルで /resume を打つ）・`model:値`・`effort:値`・`ucmd:名前 引数`（画面からのコマンド）・`stub:行数`（API に届いたモデルと effort）・`browser:スクリプト 幅x高さ`（ブラウザの確認をこのターミナルを相手に流す） | `WORKDIR=… STUB=stub-api-echo.mjs python3 dev/term/run-term.py "type:最初の会話です" enter wait:9 "type:/clear" enter wait:4 "type:二つ目" enter wait:9 sessions "resume:0" wait:6 chan` |
| `term/fake-ide.mjs` と run-term.py の `FAKE_IDE` | VS Code の拡張機能の代わり。Claude Code が探すロックファイルを置き、IDE の MCP サーバーとして WebSocket で答え、頼まれたことを時刻つきで `t/ide.log` に書く。`ide` の手順で、前に見たところからの続きを出す（依頼のたびに来る `closeAllDiffTabs` が、本物の拡張機能でターミナルを表に出すもの） | `FAKE_IDE=4391 EXTRA_ENV="CLAUDE_CODE_SSE_PORT=4391 TERM_PROGRAM=vscode CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL=1" STUB=stub-api-echo.mjs python3 dev/term/run-term.py ide "type:こんにちは" enter wait:7 ide "send:画面から" wait:7 ide`（`EXTRA_ENV` はターミナルの環境に足す変数。`CLAUDE_CODE_AUTO_CONNECT_IDE=false` を足すとつながらない） |
| `term/fakebin/rundll32.exe` | WSL で Windows のブラウザを開く呼び出しの偽物（呼ばれた URL を記録する） | `FAKE_WSL=Ubuntu EXTRA_PATH=$PWD/dev/term/fakebin` を付けて run-term.py を動かす |
| `ziptest/stub-api*.mjs` | 偽の Messages API。`stub-api-ask.mjs` は「ASK_ME」で選択肢つきの質問を返し、`stub-api-skill.mjs` はスキルを呼び、`stub-api-dump.mjs` は届いたリクエストを書き出し、`stub-api-echo.mjs` は依頼の文をそのまま返して、届いたモデルと effort を記録する（「SLOW」を含む依頼は 9 秒かかる） | run-term.py が起動する（`STUB=stub-api-ask.mjs` で切り替え） |
| `probe/` | エンジンの振る舞いを調べる Mod。質問・次の入力の提案・コマンド一覧まわりの出来事を、来た順にファイルへ書き出す | `PLUGIN=$PWD/dev/probe python3 dev/term/run-term.py ... log`（書き出し先は `hooks/register.ts` の `LOG`） |
| `e2e/live-pick.py` | 模擬ターミナルを相手に、/resume の一覧と再開、見出しのモデルと effort、コマンドの結果（表）を通す | `python3 dev/e2e/live-pick.py 1440x900`（`FONTS` に Web フォントのフォルダ、`OUT` に撮影の置き場所） |
| `e2e/real-pick.py` | 本物の Claude Code のターミナルを相手に同じことを通す。`run-term.py` の `browser:` 手順から動かす | `... "browser:dev/e2e/real-pick.py 1440x900 all"`（`all`・`resume`・`model`・`effort`・`context`） |
| `e2e/real-at.py` | 本物の Claude Code のターミナルを相手に、送信欄の `@`（ファイルの一覧・フォルダの中・添付して送る）と、長い文で送信欄が広がってからスクロールになるところを通す。`run-term.py` の `browser:` 手順から動かす | `... "browser:dev/e2e/real-at.py 1440x900"`（作業フォルダに git とファイルを用意しておく。`STUB_FIND` にファイルの中の文字を入れると、API に届いたかが stub.log に出る） |
| `e2e/real-end.py` | 本物の Claude Code のターミナルを相手に、上に戻って読んでいるあいだに別の画面から送り、「新着」の数と画面が動かないことを確かめてから ↓ で戻る。続けて質問の「ほかの答え」に複数行を書いて答え、改行ごと Claude に届くかを見る。`run-term.py` の `browser:` 手順から動かす | `STUB=stub-api-ask.mjs python3 dev/term/run-term.py "browser:dev/e2e/real-end.py 1440x900"` |
| `e2e/demo-end.py` | デモ版で同じこと（↓ のボタン、新着の数、チャンネル切り替え、質問の答えの欄が 5 行まで広がる） | `python3 dev/e2e/demo-end.py 1440x900`（`390x844` でスマホ幅） |
| `e2e/live-*.py` | 本物の受け皿と模擬ターミナル（`test/simulate.mjs`）を相手に、ブラウザ（Playwright）で画面の操作を通す | `python3 dev/e2e/live-new.py` など（要 Playwright と Chromium） |
| `e2e/demo-*.py` | デモ版の画面（`ui-src/demo.html`）の動きを撮影して確かめる | 同上 |
| `e2e/set-shot.py`・`setstates.py`・`guide-*.py` | 設定ボタンの状態と、取扱説明書の各節を撮影する | 同上 |

## 公開しているもの（claude.ai）

- 取扱説明書：https://claude.ai/artifact/D3T5LKVSUZiDsTwV7nJnvo
- デモ：https://claude.ai/artifact/JJ7QHUVyZU3HiJqXohYWXe
- 作り方のドキュメント（Claude Code Mod の作り方）：https://claude.ai/artifact/EpCvQksMkwcTwYksBsChr3

## 型定義

`.claude-plugin/types/` は、Claude Code がこのフォルダの Mod を読み込むたびに書き出すので、リポジトリには入れていません。`claude --plugin-dir .` で一度起動すると作られます。
