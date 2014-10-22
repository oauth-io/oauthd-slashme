oauthd slashme
==============

This is the **Slashme** plugin for oauthd. oauthd is the open source version of [OAuth.io](https://oauth.io)'s core, which allows you to easily integrate over 100 OAuth provider and use their APIs.

This plugin gives you the possibility to retrieve unified user information from many of the available providers, by adding the `https://[yoururl]/auth/:privder/me` endpoint.

To learn more about oauthd, please check out [oauthd's repository](https://github.com/oauth-io/oauthd).

Installation
------------

To install this plugin in an oauthd instance, just run the following command (you need to have oauthd installed):

```sh
$ oauthd plugins install https://github.com/oauth-io/oauthd-slashme.git
```

If you want to install a specific version or branch of this plugin, just run:

```sh
$ oauthd plugins install https://github.com/oauth-io/oauthd-slashme.git#branch_or_tag
```