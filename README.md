<div align="center">
  <img src="./app-icon.png" width="160" height="160" alt="Endfield Gacha Logo" />

  <h1>Endfield Gacha</h1>

  <p>
    <strong>“你好，咕咕嘎嘎！”</strong><br>
    一个《明日方舟：终末地》寻访记录统计与分析工具<br>
    支持 Windows / macOS / Linux
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
- **国服 / 国际服**：支持国服（官服 / Bilibili 渠道服）与国际服（亚服 / 欧美服）。

### 同步方式

- **日志同步（仅 Windows）**：选择 `system(国服)` 或 `system(国际服)` ，从对应的客户端 WebView 日志抓取链接得到 `token`，再解析出 `uid/roleId`，将数据同步到对应的账号中。
- **添加账号同步（推荐）**：应用内打开网页登录并自动抓取 Token，或手动粘贴 Token。

### 同步与数据

- **增量追加**：按 `seqId` 去重合并，重复同步不会重复写入，只会追加缺失记录。
- **角色池 / 武器池**：支持角色池与武器池寻访记录同步与统计展示。
- **数据本地保存**：所有数据均保存到本地 `userData/` 下（不同系统路径不同；不上传任何第三方服务器）。
  - 配置文件：`userData/config.json`
  - 寻访记录数据：`userData/gachaData/*.json`

### UI 与体验

- **统计图表**：包含池子分布饼图、6★历史记录、当期垫抽等信息。
- **主题切换**：支持 `跟随系统 / 亮色模式 / 暗色模式`。

### 技术栈

- **前端**：Nuxt 4 + Vue 3 + TypeScript
- **UI**：@nuxt/ui
- **图表**：ECharts
- **桌面端**：Tauri 2

## 界面预览

> 预览图可能与当前版本略有差异，以实际界面为准。

<div align="center">
  <img src="preview.png" alt="Preview" />
</div>

## 下载与安装

本工具支持 **Windows / macOS / Linux**

1. 前往 [Releases](https://github.com/bhaoo/endfield-gacha/releases) 页面。
2. 下载最新版本中与你系统对应的安装包（Windows / macOS / Linux）。
   - Windows 可以直接下载便携版（Endfield_Gacha_Portable.exe）
   - Linux 推荐通过 `deb` 方式安装（通过 `AppImage` 安装可能因为 GLib 版本问题导致打开白屏）
4. 运行即可（Windows 请确保应用所在目录具备写入权限，以便创建/写入 `userData/`）。

## 数据存储位置

- **Windows**:  `exe` 同级目录下的 `userData/` 目录中。
- **macOS**: `~/Library/Application Support/com.bhao.endfieldgacha/userData/`
- **Linux**: `~/.local/share/com.bhao.endfieldgacha/userData/`

## 使用说明

### 日志同步（仅限 Windows 操作系统）

macOS、Linux 操作系统请使用下方的「添加账号同步」方式登录后同步。

1. 在对应客户端内打开一次 **抽卡记录页**。
2. 打开本工具，账号下拉选择 `system(国服)` 或 `system(国际服)`。
3. 点击“同步最新数据”，会自动识别并保存到对应的 `<uid>_<roleId>.json`。

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
- 本软件仅供个人学习与研究使用，禁止商业化使用、再分发或提供任何增值服务；因违反上述限制产生的责任由使用者自行承担。
- 使用本软件需遵守所在地法律法规、游戏/平台服务条款及知识产权要求；如有合规/安全疑虑，请立即停止使用并卸载。
- 本项目不会采集或上传任何个人隐私，所有用户数据与登录凭据仅存储在本地；涉及的游戏数据均由用户自行选择导入/导出。

## 最后

感谢 [@RoLingG](https://github.com/RoLingG)、[@YueerMoe](https://github.com/YueerMoe) 帮助完善后端相关数据。

Copyright &copy; 2026 [Bhao](https://dwd.moe/), under MIT License.
