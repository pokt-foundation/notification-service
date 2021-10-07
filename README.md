# Pocket's Notification system

Monitor apps stake usage throughout the session time.

[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors) 

<!-- markdownlint-disable -->
<div>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg"/></a>
    <a href="https://github.com/pokt-foundation/notification-service/pulse"><img src="https://img.shields.io/github/last-commit/pokt-foundation/notification-service"/></a>
    <a href="https://github.com/pokt-foundation/notification-service/pulls"><img src="https://img.shields.io/github/issues-pr/pokt-foundation/notification-service.svg"/></a>
    <a href="https://github.com/pokt-foundation/notification-service/issues"><img src="https://img.shields.io/github/issues-closed/pokt-foundation/notification-service.svg"/></a>
</div>
<!-- markdownlint-restore -->

## Introduction

The pocket's notification system is a monitor intended for internal use in the pocket organization, provides information on the usage of applications and load balancers 
and also sends alerts in case the configured threshold is exceeded. Currently used by
internal channels and the [portal](https://github.com/pokt-foundation/portal).

## Deployment

Deployment is done with [aws-sam](https://aws.amazon.com/serverless/sam/) as several lambdas but is not tied to it, the code can be easily redeployed into any enviroment that supports nodejs. For lambda you need a [configuration file](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-config.html) (example in the repo), provide the environment variables by filling `parameter_overrides` and run the commands `sam build` and `sam deploy` respectively.


<!-- markdownlint-disable -->
<div>
  <a  href="https://twitter.com/poktnetwork" ><img src="https://img.shields.io/twitter/url/http/shields.io.svg?style=social"></a>
  <a href="https://t.me/POKTnetwork"><img src="https://img.shields.io/badge/Telegram-blue.svg"></a>
  <a href="https://www.facebook.com/POKTnetwork" ><img src="https://img.shields.io/badge/Facebook-red.svg"></a>
  <a href="https://research.pokt.network"><img src="https://img.shields.io/discourse/https/research.pokt.network/posts.svg"></a>
</div>
<!-- markdownlint-restore -->

## License

This project is licensed under the MIT License; see the [LICENSE.md](LICENSE.md) file for details.
