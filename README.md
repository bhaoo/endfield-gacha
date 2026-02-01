<div align="center">
  <img src="./app-icon.png" width="160" height="160" alt="Endfield Gacha Logo" />

  <h1>Endfield Gacha</h1>

  <p>
    <strong>“你好，咕咕嘎嘎！”</strong><br>
    一个《明日方舟：终末地》寻访记录统计与分析工具
  </p>

  <p>
    <a href="https://github.com/bhaoo/endfield-gacha/releases">
      <img src="https://img.shields.io/github/v/release/bhaoo/endfield-gacha?style=flat-square&label=Release&color=%23383838&labelColor=%23fffa00" />
    </a>
    <img src="https://img.shields.io/github/downloads/bhaoo/endfield-gacha/total?style=flat-square&label=Downloads&color=%23383838&labelColor=%23fffa00" />
    <img src="https://img.shields.io/github/last-commit/bhaoo/endfield-gacha/master?style=flat-square&color=%23383838&labelColor=%23fffa00" />
    <img src="https://img.shields.io/github/license/bhaoo/endfield-gacha?style=flat-square&color=%23383838&labelColor=%23fffa00" />
  </p>
</div>

---

## 功能特性

### 账号与服务器

- **多账号管理**：支持添加多个账号的多个角色并在顶部下拉切换。
- **国服 / 国际服**：支持国服（官服 / Bilibili 渠道服）与 国际服（亚服 / 欧美服）。
- **日志账号细分**：
  - `system(自动识别)`：从日志中抓取链接，自动识别渠道并切换到对应的日志账号保存数据。
  - `system(官服)` / `system(Bilibili)`：手动指定日志账号保存数据。

### 同步与数据

- **增量追加**：按 `seqId` 去重合并，重复同步不会重复写入，只会追加缺失记录。
- **角色池 / 武器池**：支持两类角色池与武器池寻访记录同步与统计展示。
- **数据本地保存**：所有数据均保存到应用同级目录的 `userData/` 下（不上传任何第三方服务器）。
  - 配置文件：`userData/config.json`
  - 寻访记录数据：`userData/gachaData/*.json`

### UI 与体验

- **统计图表**：包含池子分布饼图、6★历史记录、当期垫抽等信息。
- **主题切换**：支持 `跟随系统 / 亮色模式 / 暗色模式`。

## 界面预览

> 预览图可能与当前版本略有差异，以实际界面为准。

<div align="center">
  <img src="preview.png" alt="Preview" style="box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2), 0 6px 20px 0 rgba(0,0,0,0.19); border-radius: 8px;" />
</div>

## 下载与安装

本工具目前仅支持 **Windows 操作系统**。

1. 前往 [Releases](https://github.com/bhaoo/endfield-gacha/releases) 页面。
2. 下载最新版本的 `Endfield_Gacha.exe`。
3. 运行即可（**不建议放在系统盘**，可能因为权限不足无法写入 `userData/`）。

## 使用说明

### 日志同步（仅限官服 / B 服）

1. 在对应客户端内打开一次 **抽卡记录页**。
2. 打开本工具，账号下拉选择 `system(自动识别)`。
3. 点击“同步最新数据”，会自动识别：
   - 官服 → 保存到 `system_official.json`
   - B 服 → 保存到 `system_bilibili.json`

### 添加账号同步

左上角“添加账号”支持两种方式：

- **应用内打开网页登录并自动抓取 Token**（推荐）
- **手动粘贴 Token**

添加成功后，可在账号下拉选择对应角色进行同步与查看。

> [!CAUTION]
> Bilibili 渠道服 ⚠ 注意
>
> 使用 `添加账号同步` 前，请先前往鹰角网络用户中心 [角色绑定](https://user.hypergryph.com/bindCharacters?game=endfield) 处绑定 Bilibili 服帐号哦~

## 注意事项

- 为了防止频繁请求触发 API 风控，同步过程中连续的请求之间会设置一定的延迟，因此若页数较多，拉取时间会稍长一些，请耐心等待 ❤。


## 免责声明

本项目为非官方工具，与 **鹰角网络 (Hypergryph)** 及其旗下组织/团体/工作室没有任何关联。游戏图片与数据版权归各自权利人所有。

- 本软件按“现状”提供，不保证可用性、稳定性或数据准确性；使用过程中造成的任何数据损失、功能异常或经济损失均由用户自行承担。
- 使用本软件需遵守所在地法律法规、游戏/平台服务条款及知识产权要求；如有合规/安全疑虑，请立即停止使用并卸载。

## 致谢

感谢 [@RoLingG](https://github.com/RoLingG) 帮助处理后端相关数据。

Copyright &copy; 2026 [Bhao](https://dwd.moe/), under MIT License.

