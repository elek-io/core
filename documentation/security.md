# Security

## General issues with CMS security 
- Need updates to maintain their security
- Have logins build in, where leaked or weak details can result in compromised sites which are hard to detect
- Run on a third party hardware & software stack that can be compromised too
- Can be easily get a target of DDOS and therefore blackmailing
- Valuable to attack since it can be used to execute code to mine crypto currency, install malware on visitors machines and run DDOS or other attacks to thrid party servers
- If compromised it can be hard to recover / result in some lost work
- Plugins and themes are third party code that runs directly on the server with the same privileges. If that code breaks or has a vulnerability, the site breaks too

Why do we even need to have a full stack of hardware and software in place, if in most cases it just displays content that is hardly updated ever? E.g. business websites, blogs etc. And highly dynamic websites most often load the content via JS and APIs anyway.

## What elek.io does
Everyone that is working on the website downloads the client and works locally. Once finished, it gets pushed to a remote repository for backup and syncing with others. Someone with the correct privileges can then build and deploy / upload it as static files. No runtime environment needed where the website is hosted. So no updates needed to maintain the security, no login screen that could allow attackers access. And because we now have very much reduced the complexity of the website being only static files, distribution becomes much easier and less expensive. The hardware requirements are shrinked to an SSD that can be accessed throught the internet. The website is not a valuable target anymore.

The only part to consider is third party access and extendability. Since everything is by default happening locally, the code running on the machine has access to all files and the network. Executing untrusted third party code in this environment is not going to happen without user permission. The elek.io client and core will therefore not have a traditional plugin system in place. All functionality has to be added through the main repositories. Since these are open source, everyone is more then welcome to contribute or even fork. I can imagine that we could implement a plugin system where the third party code is executed as a cloud function i.e AWS lambda. Then only the result data is taken back to the local environment. Not allowing closed source code, so everyone can audit it should be a must too. But that's future talk.

Themes are a bit different here. Since we want to compile and therefore execute code locally to not rely on any external system that would add complexity and introduce cost by default, we need a way to "securely" do that. And since VMs and containers are just a way around the actual problem of not trusting the code, we need to introduce ways of actually trusting the theme. One way would be to only provide themes that we ourself create. Custom themes could be opt-in as an "insecure" option. In the future I could imagine a similar approach like the plugin system. Where for a small fee the theme could be compiled via cloud functions. This way everyone is free to use it either:

1. Fully local with a trusted theme that is build by us and without any external dependency or cost
2. Fully local with a custom theme that is build either by the owner of the website himself or a third party only for the owner. This way the theme is trusted too
3. Fully local with an untrusted thrid party theme from the internet. The owner now takes full responsibility for everything that happens to his maschine / network
4. A hybrid approach where the owner runs the build of an trusted or untrusted theme in the cloud. This route would introduce a small cost and external dependency but is the most secure one by far