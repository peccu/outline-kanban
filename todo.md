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

### ✅ T9. detail に子/孫タスクのリスト + パンくず
**方針**: detail 下部に子タスク一覧（リスト表示）。クリックで「その子を nodeId にして
detail を開き直す」。上部にパンくず（root → … → 現在）。長い場合は中間を `…` で省略し、
先頭/末尾を残す＋ホバー/クリックで展開。
**対象**: `NodeDetailModal.vue`（親チェーン取得に祖先 API or 逐次 GET）
**テスト**: `e2e-detail-children`

### ✅ T1. データバックアップ / リストア（最大・最後）
**方針**: サーバに `GET /api/backup`（lanes/nodes/tags/nodeTags/comments + 添付メタ + 添付バイナリを
ZIP 化: `data.json` + `attachments/<id>`）と `POST /api/restore`（ZIP 受領で全置換 or マージ）。
クライアントはヘッダーに「backup / restore」ボタン → ZIP ダウンロード / アップロード。
**対象**: 新規 `server/api/routes/backup.ts`, `router.ts`, `queries.ts`, 新規 `BackupRestore.vue`, `App.vue`
**ZIP**: サーバ側で軽量 zip 生成（依存: `fflate` など）。
**テスト**: `e2e-backup`（ダウンロード→リストアで往復）

### ⬜ T11. レーンアイコンの色変更
**方針**: レーンには既に `color` フィールドと `useUpdateLane` がある。ヘッダーのレーンメニュー
（`LaneHeader.vue` の `…`）にカラーピッカーを追加し、`TagPill` と同様のプリセット色から選択。
ドット表示に反映。
**対象**: `LaneHeader.vue`, `tag-color.ts`(プリセット流用) or 専用プリセット
**テスト**: `e2e-lane-color`

---

## 進捗ログ
- 2026-06-02: 計画作成。T2 から着手。
- 2026-06-02: T2 完了（OutlinerEditor: focus 中は setContent スキップ）。e2e-card-input PASS。commit。
- 2026-06-02: T8 完了（コメント欄 min-h 拡大 + リサイズ）。commit。
- 2026-06-02: T5 完了（タイトル Enter で description 編集へフォーカス）。commit。
- 2026-06-02: T7 完了（detail にタグ付け外し UI = TagEditor.vue）。e2e-detail-tags PASS。commit。
- 2026-06-02: T3 完了（useDeleteTag + TagManager.vue + ヘッダーボタン）。e2e-tag-delete PASS。commit。
- 2026-06-02: T4 完了（tag-filter.ts + TagManager フィルタ + OutlinePanel/NodeRow 絞り込み）。e2e-tag-filter PASS。commit。
- 2026-06-02: T6 完了（detail status → lane セレクタ + status トグル併存）。e2e-detail-lane PASS。commit。
- 2026-06-02: T10 完了（子に laneId 付与可・カードに所属レーンチップ・DnD で laneId のみ更新）。e2e-child-lane-label PASS。commit。
- 2026-06-02: T9 完了（detail に子リスト + パンくず + ドリルダウン）。e2e-detail-children PASS。commit。
