# 開発用の道具

Fogcast を作るときに使った確認用のスクリプトです。Mod 本体には含まれず、配布の zip にも入れません。
パスは作ったときの環境（リポジトリが `/home/claude/fogcast`）を前提にしています。別の場所で使うときは、各ファイルの先頭にある `ROOT`・`PLUGIN`・`LOG` を書き換えてください。

| 場所 | 何をするか | 動かし方 |
|---|---|---|
| `term/run-term.py` | 本物の Claude Code を擬似端末（`pty` + `pyte`）で `--plugin-dir` 付きで起動し、画面の文字を読む。API は `ziptest/` の偽物に向けるので料金はかからない | `python3 dev/term/run-term.py "type:ASK_ME" enter wait:8 show:asked`（手順は `wait:秒`・`show:名前`・`type:文`・`enter`・`key:tab` など。要 `pip install pyte`） |
| `term/fakebin/rundll32.exe` | WSL で Windows のブラウザを開く呼び出しの偽物（呼ばれた URL を記録する） | `FAKE_WSL=Ubuntu EXTRA_PATH=$PWD/dev/term/fakebin` を付けて run-term.py を動かす |
| `ziptest/stub-api*.mjs` | 偽の Messages API。`stub-api-ask.mjs` は「ASK_ME」で選択肢つきの質問を返し、`stub-api-skill.mjs` はスキルを呼び、`stub-api-dump.mjs` は届いたリクエストを書き出す | run-term.py が起動する（`STUB=stub-api-ask.mjs` で切り替え） |
| `probe/` | エンジンの振る舞いを調べる Mod。質問・次の入力の提案・コマンド一覧まわりの出来事を、来た順にファイルへ書き出す | `PLUGIN=$PWD/dev/probe python3 dev/term/run-term.py ... log`（書き出し先は `hooks/register.ts` の `LOG`） |
| `e2e/live-*.py` | 本物の受け皿と模擬ターミナル（`test/simulate.mjs`）を相手に、ブラウザ（Playwright）で画面の操作を通す | `python3 dev/e2e/live-new.py` など（要 Playwright と Chromium） |
| `e2e/demo-*.py` | デモ版の画面（`ui-src/demo.html`）の動きを撮影して確かめる | 同上 |
| `e2e/set-shot.py`・`setstates.py`・`guide-*.py` | 設定ボタンの状態と、取扱説明書の各節を撮影する | 同上 |

## 公開しているもの（claude.ai）

- 取扱説明書：https://claude.ai/artifact/D3T5LKVSUZiDsTwV7nJnvo
- デモ：https://claude.ai/artifact/JJ7QHUVyZU3HiJqXohYWXe
- 作り方のドキュメント（Claude Code Mod の作り方）：https://claude.ai/artifact/EpCvQksMkwcTwYksBsChr3

## 型定義

`.claude-plugin/types/` は、Claude Code がこのフォルダの Mod を読み込むたびに書き出すので、リポジトリには入れていません。`claude --plugin-dir .` で一度起動すると作られます。
