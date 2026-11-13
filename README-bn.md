# এক ডিপ্লয় (Worker-ই অ্যাপ + ব্যাকএন্ড)
ফাইল: worker.js · index.html · wrangler.toml (তিনটাই একই ফোল্ডারে রাখুন)

1. @BotFather → /newbot → BOT_TOKEN নিন। @userinfobot থেকে নিজের ID নিন।
2. npm i -g wrangler && wrangler login
3. wrangler kv namespace create KV → id টা wrangler.toml-এ বসান
4. wrangler.toml-এ BOT_USERNAME, ADMIN_IDS বসান
5. wrangler secret put BOT_TOKEN
   wrangler secret put WEBHOOK_SECRET   (যেকোনো লম্বা র‍্যান্ডম টেক্সট)
   wrangler secret put ADMIN_PASS
6. wrangler deploy → URL পাবেন (https://dream-app.xxx.workers.dev)
7. ওই URL টা wrangler.toml-এর APP_URL-এ বসিয়ে আবার wrangler deploy
8. Webhook (একবার):
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=<URL>/webhook" -d "secret_token=<WEBHOOK_SECRET>"
9. BotFather → Bot Settings → Menu Button → ওই URL দিন
10. বটকে ৩টা চ্যানেলে অ্যাডমিন বানান; অ্যাপে লোগোতে ট্যাপ → Admin → Gate-এ চ্যানেল দিন

Ban: বটে /ban <id> , /unban <id> (শুধু ADMIN_IDS)
রেফার লিংক: https://t.me/<বট>?start=r-<ID>
