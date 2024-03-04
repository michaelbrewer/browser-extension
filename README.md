# Coder Browser extension

[![Setup Automated](https://img.shields.io/badge/setup-automated-blue?logo=gitpod)](https://gitpod.io/#https://github.com/gitpod-io/browser-extension)

> A HACKED/POC VERSION OF THE GITPOD EXTENSION TO SUPPORT A SELF-HOSTED CODER WORKSPACE

This fork changes the logo and adds a setting for `template`, which defaults to "docker" see [Coder Templates](https://coder.com/docs/v2/latest/templates)

This leverages the [Open in Coder](https://coder.com/docs/v2/latest/templates/open-in-coder) flow, but as an extension.

Git url is assume to be the param `git_repo` in your template.

Example coder  template used to make this work

```terraform
terraform {
  required_providers {
    coder = {
      source = "coder/coder"
    }
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}

locals {
  username = data.coder_workspace.me.owner
  # Get the folder of the checked out project
  folder_name = try(element(split("/", data.coder_parameter.git_repo.value), length(split("/", data.coder_parameter.git_repo.value)) - 1), "")
}

data "coder_provisioner" "me" {
}

# Add param for the git url
data "coder_parameter" "git_repo" {
  name         = "git_repo"
  display_name = "Git repository"
  default      = "https://github.com/coder/coder"
}

provider "docker" {
  host = "unix:///Users/michaelbrewer/.docker/run/docker.sock"
}

data "coder_workspace" "me" {
}

resource "coder_agent" "main" {
  arch           = data.coder_provisioner.me.arch
  os             = "linux"
  startup_script = <<-EOT
    set -e

    # Clone repo when needed
    if [ ! -d "${local.folder_name}" ]
    then
        git clone ${data.coder_parameter.git_repo.value}
    fi
  EOT

  display_apps {
    web_terminal    = false
    vscode          = false
    ssh_helper      = false
    vscode_insiders = false
  }

  env = {
    GIT_AUTHOR_NAME     = coalesce(data.coder_workspace.me.owner_name, data.coder_workspace.me.owner)
    GIT_AUTHOR_EMAIL    = "${data.coder_workspace.me.owner_email}"
    GIT_COMMITTER_NAME  = coalesce(data.coder_workspace.me.owner_name, data.coder_workspace.me.owner)
    GIT_COMMITTER_EMAIL = "${data.coder_workspace.me.owner_email}"
  }

  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Home Disk"
    key          = "3_home_disk"
    script       = "coder stat disk --path $${HOME}"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "CPU Usage (Host)"
    key          = "4_cpu_usage_host"
    script       = "coder stat cpu --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Memory Usage (Host)"
    key          = "5_mem_usage_host"
    script       = "coder stat mem --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Load Average (Host)"
    key          = "6_load_host"
    script   = <<EOT
      echo "`cat /proc/loadavg | awk '{ print $1 }'` `nproc`" | awk '{ printf "%0.2f", $1/$2 }'
    EOT
    interval = 60
    timeout  = 1
  }

  metadata {
    display_name = "Swap Usage (Host)"
    key          = "7_swap_host"
    script       = <<EOT
      free -b | awk '/^Swap/ { printf("%.1f/%.1f", $3/1024.0/1024.0/1024.0, $2/1024.0/1024.0/1024.0) }'
    EOT
    interval     = 10
    timeout      = 1
  }
}

# Open cloned project
module "code-server" {
  source   = "registry.coder.com/modules/code-server/coder"
  version  = "1.0.5"
  agent_id = coder_agent.main.id
  folder   = "/home/${local.username}/${local.folder_name}"
  settings = {
    "workbench.colorTheme" : "Visual Studio Dark"
    "workbench.startupEditor" : "readme"
  }
}

resource "docker_volume" "home_volume" {
  name = "coder-${data.coder_workspace.me.id}-home"
  lifecycle {
    ignore_changes = all
  }
  labels {
    label = "coder.owner"
    value = data.coder_workspace.me.owner
  }
  labels {
    label = "coder.owner_id"
    value = data.coder_workspace.me.owner_id
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  labels {
    label = "coder.workspace_name_at_creation"
    value = data.coder_workspace.me.name
  }
}

resource "docker_image" "main" {
  name = "coder-${data.coder_workspace.me.id}"
  build {
    context = "./build"
    build_args = {
      USER = local.username
    }
  }
  triggers = {
    dir_sha1 = sha1(join("", [for f in fileset(path.module, "build/*") : filesha1(f)]))
  }
}

resource "docker_container" "workspace" {
  count = data.coder_workspace.me.start_count
  image = docker_image.main.name
  name = "coder-${data.coder_workspace.me.owner}-${lower(data.coder_workspace.me.name)}"
  hostname = data.coder_workspace.me.name
  entrypoint = ["sh", "-c", replace(coder_agent.main.init_script, "/localhost|127\\.0\\.0\\.1/", "host.docker.internal")]
  env        = ["CODER_AGENT_TOKEN=${coder_agent.main.token}"]
  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }
  volumes {
    container_path = "/home/${local.username}"
    volume_name    = docker_volume.home_volume.name
    read_only      = false
  }

  labels {
    label = "coder.owner"
    value = data.coder_workspace.me.owner
  }
  labels {
    label = "coder.owner_id"
    value = data.coder_workspace.me.owner_id
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  labels {
    label = "coder.workspace_name"
    value = data.coder_workspace.me.name
  }
}
```

> REST OF THE DOCS / CODE HAS NOT ADDITIONAL CHANAGES
---

This is the browser extension for Gitpod. It supports Chrome (see [Chrome Web Store](https://chrome.google.com/webstore/detail/dodmmooeoklaejobgleioelladacbeki/)), Firefox (see [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/gitpod/)) and Edge (see [how to install Chrome extensions](https://support.microsoft.com/help/4538971/microsoft-edge-add-or-remove-extensions)), and adds a **Gitpod** button to the configured GitLab, GitHub and Bitbucket installations (defaults to `gitlab.com`, `github.com` and `bitbucket.org`) which immediately creates a Gitpod workspace for the current git context:

![Gitpodify](./docs/github-injected.png "Gitpodify")

### Issues

We are currently tracking all issues related to the browser extension in the [`gitpod-io/gitpod`](https://github.com/gitpod-io/gitpod) repository.
You can use the [`component: browser-extension`](https://github.com/gitpod-io/gitpod/issues?q=is%3Aissue+is%3Aopen+extension+label%3A%22component%3A+browser-extension%22) label to search for relevant issues including feature proposals and bug reports.

### Development

To make changes and test them using Gitpod itself:

-   add test cases to the [unit test](https://github.com/gitpod-io/browser-extension/blob/se/plasmo/test/src/button-contributions.spec.ts#L39)
-   try out changes like this:
    1. run `pnpm build`
    1. run `pnpm watch-prod` and download the built binary for your system (local machine)
    1. run the binary anywhere on your local machine to sync the extension folder locally.
    1. open Chrome and go to `chrome://extensions/`
    1. enable `Developer mode` (top right)
    1. click `Load unpacked` (top left) and select the folder you just downloaded
    1. now you can test your changes
    1. repeat step 1 and 2 and [reload the extension](chrome://extensions/) whenever you want to test new changes

#### Build

The build happens automatically when you start a workspace but if you want to build explicitly, use these commands:

```
pnpm install
pnpm build --target=chrome-mv3 # or --target=firefox-mv2
pnpm package --target=chrome-mv3 # or --target=firefox-mv2
```

### Testing

You can test the extension without publishing to the store. Before uploading the bundle to the browser, make sure to [build](#build) the code, then follow these steps:

For Chrome:

1. Open Chrome
2. Click Settings -> Extensions -> Load unpacked
3. Select the `chrome-mv3-prod` folder inside of `build/`

For Firefox

1. Open Firefox
1. Go to `about:debugging#/runtime/this-firefox`
1. Click Load Temporary Add-on -> Select the `firefox-mv2-prod.zip` file. Please note, that some features (like extension settings) will not work.

## Release

We currently publish the extension for **Chrome** and **Firefox**.

To release a new version, follow these steps:

1. Bump up the version value inside `manifest.json`
1. Push your changes to `master`
1. Create a tag `vX.Y.Z`
1. Compose a list of changes using the list of commits that were pushed since last version
1. [Create a new release](https://github.com/gitpod-io/browser-extension/releases/new), listing changes:

    ```yaml
    ### Changes

    - Change/Fix A
    - Change/Fix B
    - Change/Fix C

    ### Credits

    Thanks to @{EXTERNAL_CONTRIBUTOR_USERNAME} for helping! 🍊
    ```

For Firefox, our [GitHub Action](https://github.com/gitpod-io/browser-extension/blob/main/.github/workflows/submit.yml) should take care of publishing for us. You can trigger a release (either staging or production) from the [workflow's tab](https://github.com/gitpod-io/browser-extension/actions/workflows/submit.yml).

For Chrome:

1. Using your Google account, open the [`gitpod-browser-extension Google Group`](https://groups.google.com/g/gitpod-browser-extension)
2. If you don't have access, reach out for [help in Slack](https://gitpod.slack.com/archives/C020VCB0U5A)
3. Once you are in the Google Group, make sure to "Switch to Gitpod" in the top navbar
4. Click "Upload new package"
5. Upload the zip file (`chrome-mv3-prod.zip`) and submit
6. Wait a few hours for the review to happen!
