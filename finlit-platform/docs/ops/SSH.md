# SSH to the server: `ssh finlit` (EC2 Instance Connect Endpoint)

Since 26 Nov 2026 the server is reached over SSH **only through an EC2 Instance Connect Endpoint** (an AWS-run tunnel inside the VPC). Port 22 is
closed to the internet, so this works from any internet connection and never times out because a home or mobile address changed.

**Why it changed (26 Nov 2026).** Port 22 had been limited to one PC's public address (`/32`, from 25 Nov). A home or mobile broadband address changes
every few days, after which `ssh` waited and ended with "Connection timed out" and the console had to be used instead. The docs also said port 22 was
open to EC2 Instance Connect's range (`13.239.158.0/29`); no such rule existed.

## What is in AWS (Sydney, ap-southeast-2)

| Part | Value |
|---|---|
| Server | `finlit`, instance `i-0ecb8f2a5f6aac695`, private IP `172.31.39.180`, security group `launch-wizard-1` (`sg-047e835589b07f531`) |
| Endpoint | `finlit-ssh`, `eice-07401cf874cccc38f`, in the server's VPC and subnet, security group: the VPC default (`sg-0de5eb474793f88a0`, outbound all) |
| Server rule | `sg-047e835589b07f531` inbound: SSH 22 **from `sg-0de5eb474793f88a0`** ("EC2 Instance Connect Endpoint finlit-ssh"). No SSH rule from any internet address. |
| Permission | IAM policy `finlit-ssh-tunnel`: `ec2-instance-connect:OpenTunnel` on that endpoint only, `remotePort` 22, `privateIpAddress` `172.31.39.180/32`, plus `ec2:DescribeInstances` and `ec2:DescribeInstanceConnectEndpoints`. Attached to IAM users without console access (one per person) |

The tunnel only carries the connection: the login is still SSH with the person's own key in `~ubuntu/.ssh/authorized_keys`. A tunnel lasts at most one
hour; open a new one with `ssh finlit` again.

## On a PC (once)

1. Install the AWS CLI v2. On Windows (PowerShell): `msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi`, then open a new PowerShell and check `aws --version`.
2. Sign the CLI in with the person's own access key (IAM user → Security credentials → Create access key → CLI; the `.csv` stays on the PC, never in chat or the repo):
   `aws configure --profile finlit` (region `ap-southeast-2`, output `json`).
3. Keep the SSH key in `~/.ssh/` (Windows: remove inherited permissions so only you can read it).
4. Add to `~/.ssh/config` (Windows: `C:\Users\<you>\.ssh\config`):

   ```
   Host finlit
     HostName i-0ecb8f2a5f6aac695
     User ubuntu
     IdentityFile ~/.ssh/<your key>.pem
     ProxyCommand aws ec2-instance-connect open-tunnel --instance-id %h --profile finlit
   ```

5. `ssh finlit`. The prompt is `ubuntu@ip-172-31-39-180`. `scp` works the same way: `scp file.zip finlit:/tmp/`.

From a browser: AWS console → EC2 → finlit → Connect → EC2 Instance Connect → **Connect using EC2 Instance Connect Endpoint**.

## Adding or removing a team member

- Add: an IAM user for them (no console access) with `finlit-ssh-tunnel` attached; they create their own access key; their public SSH key goes on its own
  line in `~ubuntu/.ssh/authorized_keys`.
- Remove: delete their access key (or the IAM user) and their line in `authorized_keys`.
- A leaked access key: deactivate and delete it in IAM at once and create a new one. It can only open this tunnel, and the tunnel still needs an SSH key.

## Rules

- Never add an SSH rule from an internet address (`/32` or `0.0.0.0/0`) to `sg-047e835589b07f531`; the endpoint is the only way in.
- Nothing automated uses SSH: deploys are pulled by the server (`deploy/aws/auto-deploy.sh`).
