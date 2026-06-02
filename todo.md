# outline-kanban 機能追加 TODO

依頼された 10 タスクの実施計画と進捗。各タスクは「実装 → 型チェック/e2e → コミット」を 1 サイクルとして進める。
`NodeDetailModal.vue` / `queries.ts` / `App.vue` を複数タスクが触るため、競合回避のため**順次実施**する（並列エージェントは使わない）。

凡例: ⬜ 未着手 / 🔄 作業中 / ✅ 完了

---

## 実施順序と方針

### ✅ T2. カンバンビューのキーボード入力バグ（最優先・独立・影響大）
**症状**: カンバンで文字を打つと反映されず1文字消える。detail は問題なし。
**原因**: タイトル保存 (`useUpdateNode`) 成功時に `invalidateQueries(["nodes"])` が走り、
リフェッチで返ったサーバ値が `OutlinerEditor` の `watch(modelValue)` 経由で `setContent` され、
入力中のカーソル/未保存文字を上書きする。
**方針**: `OutlinerEditor` の modelValue watcher で、エディタがフォーカス中 (`editor.isFocused`) は
`setContent` をスキップ（ローカル入力を正とする）。blur 後に同期。
**対象**: `client/src/components/OutlinerEditor.vue`
**テスト**: `e2e-card-input`（連続入力で全文字が残ることを検証）

### ✅ T8. detail コメント編集欄の高さが狭い（trivial）
**方針**: コメント textarea の `min-h` を拡大 + 説明欄と高さ感を揃える。
**対象**: `NodeDetailModal.vue`
**テスト**: 型チェックのみ（CSS）

### ✅ T5. detail でタイトルの次は description にフォーカス
**方針**: タイトル編集中に Enter 確定したら description 編集にフォーカス遷移。
初期フォーカスは現状 description で OK。
**対象**: `NodeDetailModal.vue`

### ✅ T7. detail でタグ付け外し UI
**方針**: status/lane セクション付近に「tags」セクションを追加。
既存タグの一覧から付与（`useTags`）、付与済みは × で外す（`useDetachTag`）、
新規名入力で作成付与（`useAttachTag` name）。
**対象**: `NodeDetailModal.vue`（必要なら小コンポーネント `TagEditor.vue`）
**テスト**: `e2e-detail-tags`

### ✅ T3. 不要タグの削除
**方針**: `useDeleteTag` を追加（サーバ DELETE /api/tags/{id} は実装済み）。
タグ管理 UI（ヘッダーに「tags」ボタン → パネル/モーダルで一覧・削除・色変更）。
**対象**: `queries.ts`, 新規 `TagManager.vue`, `App.vue`
**テスト**: `e2e-tag-delete`

### ✅ T4. タグで絞り込み
**方針**: 選択タグ集合のグローバルストア（`tag-filter.ts`, localStorage 永続化）。
ヘッダー or タグ管理 UI でトグル。`OutlinePanel`/`NodeRow` で、選択タグを持たないルート/子を非表示。
AND/OR は OR（いずれか一致）を既定に。
**対象**: 新規 `tag-filter.ts`, `App.vue`, `OutlinePanel.vue`, `NodeRow.vue`
**テスト**: `e2e-tag-filter`

### ✅ T6. status とレーンの不整合
**症状**: レーン追加が detail の status に出ない / detail で status 変えてもカンバンに反映されない。
**背景(memory)**: 「レーン = status」。status enum はレガシー。
**方針**: detail の status セクションを **lane セレクタ**に置換（全レーン列挙、選択で
ルートノードを当該レーンへ `move`）。これでカンバンに即反映。子ノード(laneId=null)は
親のレーン表示＋「移動でルート化」を許可 or 非活性。既存 status enum は色表示用に温存可。
**対象**: `NodeDetailModal.vue`, `queries.ts`(useLanes 利用)
**テスト**: `e2e-detail-lane`

### ✅ T10. 子/孫カードに別レーン所属マーク
**症状**: 子は親の場所に表示されるが、本来の所属レーンが分かるラベルが欲しい。
子を DnD したら場所は親のまま、ラベル(所属レーン)が変わるイメージ。
**方針**: 子ノードに `laneId` を持たせられるようにし（現状ルートのみ laneId）、
カード上に所属レーンのチップを表示。DnD で別レーンにドロップした子は親直下に留まりつつ
`laneId` のみ更新。表示は親ツリー内のまま。
**対象**: `NodeRow.vue`, ドロップ処理, サーバ move バリデーション確認
**テスト**: `e2e-child-lane-label`
**注意**: データモデル影響あり。慎重に。

### ⬜ T9. detail に子/孫タスクのリスト + パンくず
**方針**: detail 下部に子タスク一覧（リスト表示）。クリックで「その子を nodeId にして
detail を開き直す」。上部にパンくず（root → … → 現在）。長い場合は中間を `…` で省略し、
先頭/末尾を残す＋ホバー/クリックで展開。
**対象**: `NodeDetailModal.vue`（親チェーン取得に祖先 API or 逐次 GET）
**テスト**: `e2e-detail-children`

### ⬜ T1. データバックアップ / リストア（最大・最後）
**方針**: サーバに `GET /api/backup`（lanes/nodes/tags/nodeTags/comments + 添付メタ + 添付バイナリを
ZIP 化: `data.json` + `attachments/<id>`）と `POST /api/restore`（ZIP 受領で全置換 or マージ）。
クライアントはヘッダーに「backup / restore」ボタン → ZIP ダウンロード / アップロード。
**対象**: 新規 `server/api/routes/backup.ts`, `router.ts`, `queries.ts`, 新規 `BackupRestore.vue`, `App.vue`
**ZIP**: サーバ側で軽量 zip 生成（依存: `fflate` など）。
**テスト**: `e2e-backup`（ダウンロード→リストアで往復）

### ✅ T12. カードにコメントマーク＋件数
**方針**: description マーク(¶)同様、コメントがあればカードに 💬 アイコン＋件数を表示。
ノード一覧 API がコメント件数を返さないので、`commentCount` を Node に含めるか、
カードで `useComments` は重い→ サーバの nodes 一覧に `commentCount` を追加するのが軽量。
**対象**: `server`(nodes 一覧に commentCount), `schemas.ts`, `NodeRow.vue`
**テスト**: `e2e-comment-badge`

### ✅ T13. detail タイトルをキーボードだけで保存して blur
**症状**: タイトルを Enter で編集モードにした後、キーボードのみで保存＆編集解除する手段がない。
**方針**: タイトル編集中の Escape を「保存して view モードへ戻す（タイトルコンテナにフォーカス）」に。
（T5 で Enter は description へ移動。Escape は保存して留まる/抜ける）。リトライ付きフォーカスで確実に。
**対象**: `NodeDetailModal.vue`
**テスト**: `e2e-detail-focus` に追記

### ✅ T14. タグ付与後はタイトルから #tag を消す
**方針**: タグは nodeTags に別途保存される。保存するタイトル文字列からは mention(#label) を除去し、
タグはピルでのみ表示。エディタ serializeToText でタイトル保存時に mention を空文字化（または attach 後に除去）。
リロード後はタイトルに #tag が残らず、ピルのみ表示。
**対象**: `OutlinerEditor.vue`(serialize), `NodeRow.vue`/`NodeDetailModal.vue`(保存値)
**注意**: mention 表示と保存値の整合に注意。
**テスト**: `e2e-tag-strip-title`

### ⬜ T15. 複数カード同時編集（マルチセレクト・Emacs 風）
**方針**: 選択モードに入る → カードフォーカス移動 → Space または `m` で選択トグル →
`M-Enter` で一括操作パネル（まとめてタグ付け / まとめてレーン移動）。全てキーボード操作可能。
グローバル selection ストア（`multi-select.ts`）。カードに選択ハイライト。
一括操作はクライアントで複数 mutation を発行。
**対象**: 新規 `multi-select.ts`, `NodeRow.vue`, 新規 `BulkActionBar.vue`/`BulkActionModal.vue`, `KanbanBoard.vue`
**テスト**: `e2e-multi-select`
**注意**: 最大級。最後に実施。

### ✅ T11. レーンアイコンの色変更
**方針**: レーンには既に `color` フィールドと `useUpdateLane` がある。ヘッダーのレーンメニュー
（`LaneHeader.vue` の `…`）にカラーピッカーを追加し、`TagPill` と同様のプリセット色から選択。
ドット表示に反映。
**対象**: `LaneHeader.vue`, `tag-color.ts`(プリセット流用) or 専用プリセット
**テスト**: `e2e-lane-color`

---

## 進捗ログ
- 2026-06-02: 計画作成。T11(レーン色) 追加。
- 2026-06-02: **T2 完了** — `OutlinerEditor` の modelValue watcher を「フォーカス中は setContent スキップ」に変更し、
  保存往復/高速入力時の v-model レースによるカーソルリセット・文字落ちを防止。`e2e-card-input` 追加
  （入力保持＋リロード永続化を検証、PASS）。※ レース自体は localhost では決定的再現が難しく、本 e2e は
  サニティ＋粗い回帰検知という位置づけ。
- 2026-06-02: **T8 完了** — コメント textarea を min-h 8rem に拡大。
- 2026-06-02: **T5 完了** — タイトル Enter 確定で description 編集へフォーカス移動（リトライ付きフォーカスで
  ProseMirror のフォーカス奪取を回避）。`e2e-detail-focus` 追加（T5+T8、PASS）。
- 2026-06-02: **T13 完了** — タイトル編集中の Escape を「保存して view モードへ戻す（タイトルコンテナにフォーカス）」に。
  エディタ内 Escape は伝播停止し、モーダルを閉じない。body textarea の Escape も同様に編集のみ抜けるよう統一。e2e-detail-focus PASS。
- 2026-06-02: 追加タスク受領: T12(コメントマーク), T13(タイトルをキーボードで保存blur), T14(タグ付与後タイトルから#tag除去),
  T15(複数カード同時編集), T11(レーン色)。計 15 タスク。
- 2026-06-02: **T7 完了** — detail に tags セクション追加（付与済みは ✕ で外す、入力で既存候補からの付与＋新規作成）。e2e-detail-tags PASS。
- 2026-06-02: **T6 完了** — detail の status セクションを実レーン一覧の lane セレクタに置換。ルートノードは選択で当該レーンへ移動しカンバンに即反映。子は親レーン従属の旨を表示。e2e-detail-lane PASS。
- 2026-06-02: **T14 完了** — `serializeToText` で mention をタイトルに書き戻さない。タグは node_tags（ピル）が正で、保存タイトルは #tag を含まない。e2e-tag-strip-title PASS。既存 e2e-tag-remove/e2e-tag-color も PASS で回帰なし。
- 2026-06-02: **T11 完了** — レーンメニューにプリセット色スウォッチ＋reset を追加。ドット表示に反映、localStorage 不要（DB の lane.color）。e2e-lane-color PASS。
- 2026-06-02: **T3 完了** — useDeleteTag 追加。ヘッダーに tags ボタン → TagManager.vue（一覧・色変更・削除、confirm 付き）。e2e-tag-delete PASS。
- 2026-06-02: **T4 完了** — tag-filter.ts（OR 絞り込み・localStorage 永続化・祖先保持）。KanbanBoard が全ノードから可視 ID を算出し provide、OutlinePanel/NodeRow が非可視を非表示。TagManager に filter トグル＋clear、ヘッダーに有効インジケータ。e2e-tag-filter PASS。
- 2026-06-02: 回帰修正2件: (1) T2 の focus-guard が空エディタへのサーバ遅延タイトルもブロックし、indent 直後の子カードが空表示になっていた → 「フォーカス中かつ非空のときのみ setContent をスキップ」に緩和（collapse 修正）。(2) T13 で body textarea の Escape に stopPropagation を足したため空 description で Escape してもモーダルが閉じない回帰 → body 側は元の「保存して閉じる」に戻す（タイトルのみ stopPropagation 維持）。e2e-collapse-subtasks/e2e-card-focus を resetData で堅牢化。全関連スイート PASS。
- 2026-06-03: **T12 完了** — nodes 一覧/取得に commentCount を追加（hydrateTags で集計）、クライアント型を再生成。カードに 💬+件数バッジ表示。コメント追加/削除で nodes を invalidate。e2e-comment-badge PASS。
- 2026-06-03: **T10 完了** — NodeUpdate に laneId 追加（型再生成）。子は move でなく PATCH で laneId のみ更新し親直下に留まる。カードに所属レーンチップ表示。DnD で子を他レーンにドロップ→ラベルのみ変更。detail のレーンセレクタも子に対応（T6 補完）。e2e-child-lane-label PASS。
- 2026-06-02: ユーザ指示「i18n 対応まで UI 文言は英語のみ」。lane 説明文を英語化。memory に記録。
