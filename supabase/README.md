# Supabase: 手動でのスキーマ変更

このリポジトリは `supabase db push` を実行しておらず、Supabaseプロジェクトとリンクした管理もしていません（`docs/database_design.md`参照：スキーマは手動で適用します）。`sql/`配下のファイルがその手動セットアップの正本ですが、Supabaseプロジェクトにアクセスできる人が適用する必要があります — これらの手順はアプリのコードからは実行されません。

## プロフィールアイコン写真機能（2026-08-21）

初回登録画面・設定画面の両方で、8種類のプリセットアイコンの代わりに好きな写真をプロフィールアイコンに設定できるようにする機能です。

対象プロジェクト: `sleepy-face`（ref: `mgtxrvwgezcqupgjuxzq`）

### 1. Storageバケットとポリシーを作成する

1. SQLエディタを開く: https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/sql/new
2. このリポジトリの `sql/2026-08-21_profile_icon_photos_bucket.sql` を開き、中身を全部コピーしてSQLエディタに貼り付ける
3. **Run**（またはCmd/Ctrl+Enter）をクリック。「Success. No rows returned」と出れば成功
4. 確認: 左サイドバーの **Storage** を開く（https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/storage/buckets ） → `profile-icon-photos` というバケットが**Public**として表示されていればOK

もし `policy already exists`（ポリシーが既に存在する）というエラーが出た場合（例えば途中で失敗して再実行した時など）は、その`create policy`の1文だけ既に反映済みという意味です。先に `drop policy "<ポリシー名>" on storage.objects;` で削除するか、該当行をコメントアウトしてから再実行してください。

### 2. カスタム写真のURLをブロックする制約がないか確認する

`profiles.icon_url` は「8種類のプリセット識別子のいずれか」というドキュメント上の想定になっていますが、これは`create_profile` RPC側だけで強制されている可能性があり（クライアントは今もプリセット値でしかこのRPCを呼びません）、カラム自体には制約がないかもしれません。直接`update`で `https://` のフルURLを書き込めるかどうか、以下で確認してください:

1. 同じSQLエディタで以下を実行:
   ```sql
   select conname, pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.profiles'::regclass;

   select tgname, pg_get_triggerdef(oid)
   from pg_trigger
   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
   ```
2. もしどちらかの結果で、`icon_url`を8種類のプリセット値に制限するようなもの（例: `CHECK (icon_url IN (...))` 制約や、それを検証するトリガー）が出てきたら削除する:
   ```sql
   alter table public.profiles drop constraint <制約名>;
   -- または
   drop trigger <トリガー名> on public.profiles;
   ```
3. 両方とも0件（何もヒットしない）なら、おそらく何もする必要はありません（既存の`updateProfile()`は8種のプリセット値をDB側の検証なしでそのまま書き込んでいるため）。

### 3. 一連の動作を確認する

アプリ内で 設定（Profile）→「写真を選ぶ」→ 写真を選択 → トリミング → 確定、と操作します。「写真をアップロードできませんでした」というエラーが出ずに保存でき、選んだ写真がアイコンとして表示されれば（画面を閉じて開き直しても残っていれば）成功です。

## 写真へのリアクション機能（2026-08-22）

ホーム画面の友達の写真に😂で1種類だけリアクション（トグル式、複数絵文字の選択肢はなし）できるようにする機能です。

1. SQLエディタを開く: https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/sql/new
2. このリポジトリの `sql/2026-08-22_photo_reactions.sql` を開き、中身を全部コピーしてSQLエディタに貼り付け、**Run**をクリック。「Success. No rows returned」と出れば成功。これで`photo_reactions`テーブルとそのRLSポリシーが作成されます
3. 確認: 左サイドバーの**Table Editor**（https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/editor ）を開き、`photo_reactions`テーブルが表示されていればOK
4. 一連の動作を確認する: アプリでホーム画面を開き、友達の写真の下にある😂ボタンをタップする。数がすぐに増え、プルリフレッシュ後も残っていればOK。もう一度タップすると取り消される

## コメント機能（2026-08-22）

ホーム画面で写真または💬ボタンをタップすると開く「投稿詳細画面」から、友達の写真にコメントできるようにする機能です。

1. SQLエディタを開く: https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/sql/new
2. このリポジトリの `sql/2026-08-22_comments.sql` を開き、中身を全部コピーしてSQLエディタに貼り付け、**Run**をクリック。「Success. No rows returned」と出れば成功。これで`comments`テーブルとそのRLSポリシーが作成されます
3. 確認: 左サイドバーの**Table Editor**（https://supabase.com/dashboard/project/mgtxrvwgezcqupgjuxzq/editor ）を開き、`comments`テーブルが表示されていればOK
4. 一連の動作を確認する: アプリでホーム画面を開き、友達の写真（または💬ボタン）をタップして投稿詳細画面に入り、コメントを入力して「送信」をタップする。すぐにコメント一覧に反映され、ホーム画面の💬の数もプルリフレッシュ後に増えていればOK
