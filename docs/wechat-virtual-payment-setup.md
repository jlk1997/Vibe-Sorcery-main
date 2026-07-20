# 微信小程序「虚拟支付」后台配置指南（道具直购）

本项目已把充值/会员改为微信官方「虚拟支付」`wx.requestVirtualPayment`（道具直购）。
代码已就绪，剩下的是**在微信小程序后台（mp.weixin.qq.com）配置道具与资金**，并把几个 ID/密钥填进 `.env`。

> 路径：小程序后台 → 左侧栏「虚拟支付」。已知你的 `OfferID=1450596008`、`AppID=wx996b9925f3b054ce`。

---

## 一、总体流程（先沙箱，后现网）

```
建道具(沙箱) → 填 .env(沙箱AppKey, env=1) → 微信开发者工具沙箱联调
  → 通过后：建/发布道具(现网) → 填现网AppKey、env=0 → 配提现账户 → 提审上线
```

- **沙箱(env=1)**：用「沙箱 AppKey」，不产生真实扣费与技术服务费，用于联调。
- **现网(env=0)**：用「现网 AppKey」，真实交易并按费率收技术服务费；上线前切换。

---

## 二、基本配置（拿 AppKey）

虚拟支付 → 基本配置 → 基础配置，能看到：

| 项 | 说明 | 填到哪里 |
| --- | --- | --- |
| AppID | 小程序ID | 已在 `WECHAT_APP_ID` |
| OfferID | 支付应用ID | `WECHAT_OFFER_ID=1450596008` |
| 沙箱 AppKey | 点「查看沙箱AppKey」 | `WECHAT_VPAY_APPKEY_SANDBOX` |
| 现网 AppKey | 点「查看现网AppKey」 | `WECHAT_VPAY_APPKEY_PROD` |

- **「是否启用苹果IAP支付」必须打开**（审核要求全终端虚拟支付；iOS 走 Apple 支付）。
- 同步配置**小程序简称**（Apple display name 要求）：公众平台 → 设置 → 基本设置 / 或按微信开放社区指引配置简称。

> 代币配置：**不需要**。本项目走「道具直购」模型，与代币充值二选一。

---

## 2.1 iOS 全终端必做清单（提审前）

1. MP：虚拟支付 → 基础配置 → **开启「苹果 IAP 支付」**。
2. MP：配置**小程序简称**。
3. 确认消息推送 URL 已通过校验：`https://你的域名/api/v1/billing/wechat/xpay-notify`（本项目生产域名为 `https://loveaibaby.cn/api/v1/billing/wechat/xpay-notify`）。
4. 上线/提审前：`.env` 中 **`WECHAT_VPAY_ENV=0`（现网）**。Apple 支付**不支持沙箱**。
5. iOS **最低支付 1 元**：`pack_10`（¥0.01）在 iOS 端会自动隐藏；真机请用 ≥¥1 的包（如 `pack_50`）验证。
6. 真机条件：iOS 15+、微信 8.0.68+、中国大陆 App Store 账户。
7. 重新提审时可在「审核说明」写明：已接入官方虚拟支付全终端（`wx.requestVirtualPayment`），Android/鸿蒙/Windows 走微信支付、iOS 走 Apple 支付；界面按钮为「立即购买」而非普通「微信支付」。

---

## 三、道具配置（核心）

虚拟支付 → 基本配置 → 道具管理 → 新建道具。**为下面每个商品各建一个道具**。

关键规则：
1. 道具**价格必须等于**下表的「应设价格」，必须**一分不差**，否则微信会因金额不符拒单。
2. 道具名称要合法合规（不能有违规词）。
3. 「道具类型」选**普通道具**，「关联关系」选**自定义**。
4. 「道具ID」是**你自己填**的（英文/下划线/数字，≤20位）。**推荐直接填成本项目商品ID**（见下表第一列），这样 `.env` 的 `WECHAT_VPAY_GOODS_JSON` 就留空不用配。
5. 填完点「提交审核」——道具本身也要过审。先在开发版建好联调，通过后再「发布到现网」。

### 商品 道具 对照表（道具ID 直接照抄第一列）

| 道具ID（照抄这个） | 道具名称 | 应设价格 | 说明 |
| --- | --- | --- | --- |
| `pack_10` | 10 次创作额度 | **¥0.01**（1 分，⚠️测试价） | 上线前请在 `billing.py` 改成真实价并同步道具价 |
| `pack_50` | 50 次创作额度 | ¥28.00 | |
| `pack_100` | 100 次创作额度 | ¥48.00 | |
| `duel_season_pass` | 决斗季卡 | ¥12.00 | 10 次免费发起决斗 |
| `sub_monthly` | 会员月卡 | ¥29.00 | 每月 30 额度 |
| `sub_yearly` | 会员年卡 | ¥268.00 | 赠 360 额度 |
| `sub_pro_commercial` | Pro 商用 | ¥99.00 | |
| `sub_team` | 团队版 | ¥199.00 | |
| `sub_api_starter` | API Starter | ¥199.00 | |

> ⚠️ `pack_10` 现在是 1 分（0.01 元）的测试价。正式上线请在
> [`backend/app/services/billing.py`](../backend/app/services/billing.py) 的 `CREDIT_PACKS["pack_10"]["amount_fen"]`
> 改成真实价格，并把该道具在后台的价格改成一致。

### 关于道具ID映射

- **推荐**：道具ID 直接填成上表第一列的商品ID，则 `.env` 的 `WECHAT_VPAY_GOODS_JSON` **留空**即可，代码会自动用商品ID当道具ID。
- 仅当你后台用了**不一样**的道具ID时，才需要配这一行（键=商品ID，值=后台道具ID）：

```
WECHAT_VPAY_GOODS_JSON={"pack_10":"后台道具ID", ...}
```

> 若某商品既没配映射、道具ID 又和商品ID 不一致，下单会失败，后端日志会打印「未配置微信道具ID」告警。

---

## 四、消息推送（发货推送，强烈建议配）

作用：用户付款成功后微信主动推「发货通知」，即使用户马上退出也能可靠到账（本项目已做「推送+轮询」双保险）。

小程序后台 → 开发管理 → 开发设置 → 消息推送：

| 项 | 填写 |
| --- | --- |
| URL(服务器地址) | `https://你的域名/api/v1/billing/wechat/xpay-notify` |
| Token | 自定义一串，同时填到 `.env` 的 `WECHAT_PUSH_TOKEN` |
| EncodingAESKey | 随机生成即可 |
| 数据格式 | **JSON** |
| 消息加解密方式 | **明文模式** 或 **兼容模式**（不要选纯「安全模式」，否则需额外解密） |

保存时微信会向该 URL 发一次校验请求（GET），后端已实现校验并回显，正常会保存成功。

---

## 五、资金管理（提现/结算）

签约开通成功后，虚拟支付栏目会变成「商户管理后台」，包含：

- **资金管理**：账户余额、提现、每日账单。
  - 结算周期 **T+3**：一笔订单完成后资金冻结，3 天后分账。
  - 待结算金额 = 尚未分账（未扣技术服务费）的金额。
  - 提现前需在后台配置好**提现账户**（对公账户/法人信息，开通商户号时填写）。
- **交易订单**：查订单、发起退款（180 天内退款平台退手续费）。
- **广告金**：平台赠送的广告投放金，可在广告金管理查看。

> 这部分是微信后台的运营操作，**代码里不需要改**。开发者只管发货逻辑，微信负责收款与结算。

---

## 六、联调步骤（沙箱）

1. `.env` 填：`WECHAT_VPAY_APPKEY_SANDBOX`、`WECHAT_VPAY_ENV=1`、`WECHAT_VPAY_GOODS_JSON`（沙箱道具ID）。
2. 重启后端：`sudo systemctl restart vibe-api vibe-worker vibe-worker-post vibe-beat`。
3. 用「微信开发者工具」打开小程序，真机调试（虚拟支付需真机，安卓/Windows；iOS 本期不支持会弹提示）。
4. 进入充值页点购买 → 应拉起虚拟支付 → 支付成功后额度到账。
5. 管理员可访问 `GET /api/v1/billing/vpay/config` 核对配置（enabled/env/道具映射是否齐全）。

## 七、上线切现网

1. 后台道具「发布到现网」。
2. `.env` 改：`WECHAT_VPAY_APPKEY_PROD`、`WECHAT_VPAY_ENV=0`，并把 `WECHAT_VPAY_GOODS_JSON` 换成现网道具ID（若与沙箱不同）。
3. `pack_10` 改回真实价格（见上）。
4. 重启后端，重新提交小程序审核。

---

## 八、对应的代码位置（便于排查）

- 下单+签名+查单+发货推送：[`backend/app/services/virtual_payment.py`](../backend/app/services/virtual_payment.py)
- 接口：`POST /billing/vpay/prepare`、`GET /billing/orders/{out_trade_no}`（轮询）、`GET|POST /billing/wechat/xpay-notify`（推送）、`GET /billing/vpay/config`（管理员核对）——见 [`backend/app/api/routes/billing.py`](../backend/app/api/routes/billing.py)
- 商品与道具映射：[`backend/app/services/billing.py`](../backend/app/services/billing.py) 的 `CREDIT_PACKS` / `SUBSCRIPTION_PLANS` / `WECHAT_VPAY_GOODS`
- 前端拉起支付：[`apps/client/src/platform/payment.ts`](../apps/client/src/platform/payment.ts)
