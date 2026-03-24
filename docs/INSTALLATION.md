# Installing SE Work Manager

> **Note**: SE Work Manager is supported on Windows only.

## Downloading

1. Go to the [Releases page](https://github.com/amruthasatishkumar/Work-Management/releases)
2. Find the latest release
3. Download **`SE Work Manager Setup x.x.x.exe`**

## Windows Installation

1. Download `SE Work Manager Setup x.x.x.exe`
2. Run the installer
3. **Windows SmartScreen** may appear because the installer is not code-signed yet
   - Click **More info** → **Run anyway** to proceed
4. Follow the installation wizard
5. Choose your installation directory (or keep the default)
6. Click **Install**
7. Launch **SE Work Manager** from the Start Menu or Desktop shortcut

### Uninstalling

Use **Add or Remove Programs** in Windows Settings and search for "SE Work Manager".

---

## Prerequisites

### Azure CLI (Required for MSX Import & Sync)

SE Work Manager imports opportunities directly from MSX (Dynamics 365). This requires Azure CLI to be installed and logged in.

**1. Install Azure CLI**

Download and run the installer from:
https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-windows

**2. Log in**

Open a terminal and run:
```bash
az login
```

A browser window will open — sign in with your Microsoft work account (`@microsoft.com`).

**3. Verify**

```bash
az account show
```

You should see your account details.

> **VPN required** — You must be connected to the Microsoft VPN before using MSX Import or Live Sync features.

---

## First-Time Setup

After installing and launching SE Work Manager:

1. **Open the app** from the Start Menu or Desktop shortcut
2. **Go to MSX Import** (in the left sidebar)
3. The auth card at the top will show your token status — if Azure CLI is logged in and VPN is connected, it should say **Valid**
4. **Set up Territories** → **Accounts** to organise your book of business
5. **Import Opportunities** from MSX using the TPID search, URL import, or Deal Team import

---

## Updating

Currently, SE Work Manager does **not** auto-update. To get a new version:

1. Go to the [Releases page](https://github.com/amruthasatishkumar/Work-Management/releases)
2. Download the latest `SE Work Manager Setup x.x.x.exe`
3. Run the new installer — it will upgrade over your existing installation
4. Your data is stored in a local SQLite database and will **not** be affected by updates

---

## Troubleshooting

### "Windows protected your PC" (SmartScreen)

The installer is not yet code-signed. This is expected.

- Click **More info**
- Click **Run anyway**

### Token shows as Invalid or Expired

- Make sure you are connected to **Microsoft VPN**
- Run `az login` again in a terminal
- Click **Refresh Token** in the MSX Import auth card

### App won't start

- Make sure Node.js is **not** required — SE Work Manager is a standalone `.exe` with everything bundled
- Try re-installing from the latest release
- Check that no antivirus software is blocking the app
