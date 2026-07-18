const path = require("path");

try {
  require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
} catch {
  /* optional */
}

const isWatch = process.argv.includes("--watch");
const isH5Watch = process.env.TARO_ENV === "h5" && isWatch;
const explicitApi = process.env.TARO_APP_API_URL;
const apiUrl = isH5Watch ? "/api/v1" : explicitApi || "http://localhost:8000/api/v1";
const apiProxyTarget = process.env.TARO_APP_API_PROXY || "http://127.0.0.1:8000";

if (process.env.TARO_ENV === "weapp" && !isH5Watch) {
  const bad =
    !explicitApi ||
    /localhost|127\.0\.0\.1/i.test(apiUrl) ||
    apiUrl.startsWith("/");
  if (bad) {
    console.warn(
      "\n[weapp] TARO_APP_API_URL must be a reachable LAN IP or HTTPS domain " +
        `(e.g. http://192.168.x.x:8000/api/v1). Current: ${JSON.stringify(apiUrl)}. ` +
        "Update apps/client/.env then rebuild. Enable「不校验合法域名」in WeChat DevTools.\n",
    );
  }
}
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const packagesRoot = path.resolve(repoRoot, "packages");

function webpackPackages(chain) {
  chain.module
    .rule("script")
    .include.add(path.join(packagesRoot, "api-client"))
    .add(path.join(packagesRoot, "i18n"))
    .add(path.join(packagesRoot, "types"))
    .end();
}

function webpackSplit(chain) {
  chain.optimization.splitChunks({
    chunks: "all",
    maxInitialRequests: 10,
    cacheGroups: {
      taro: { test: /[\\/]node_modules[\\/]@tarojs[\\/]/, name: "taro-vendor", priority: 30 },
      react: {
        test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
        name: "react-vendor",
        priority: 28,
      },
      lodash: { test: /[\\/]node_modules[\\/]lodash-es[\\/]/, name: "lodash-vendor", priority: 22 },
      swiper: {
        test: /[\\/]node_modules[\\/](swiper|dom7|ssr-window)[\\/]/,
        name: "swiper-vendor",
        priority: 21,
        chunks: "async",
      },
      stencil: { test: /[\\/]node_modules[\\/]@stencil[\\/]/, name: "stencil-vendor", priority: 21, chunks: "async" },
      ops: { test: /[\\/]packageOps[\\/]/, name: "chunk-ops", priority: 25 },
      stack: { test: /[\\/]packageStack[\\/]/, name: "chunk-stack", priority: 25 },
      commerce: { test: /[\\/]packageCommerce[\\/]/, name: "chunk-commerce", priority: 25 },
      copilot: { test: /[\\/]packageCopilot[\\/]/, name: "chunk-copilot", priority: 25 },
      vendors: {
        test: /[\\/]node_modules[\\/]/,
        name: "vendors",
        priority: 10,
        reuseExistingChunk: true,
      },
    },
  });
}

function webpackResolve(chain) {
  chain.resolveLoader.modules
    .add(path.join(repoRoot, "node_modules"))
    .add("node_modules");
}

const clientRoot = path.resolve(__dirname, "..");

/** Force a single React copy for weapp — alias only; do not override Taro splitChunks (breaks page chunks). */
function webpackMiniReactSingleton(chain) {
  const reactPkg = path.dirname(require.resolve("react/package.json", { paths: [clientRoot] }));

  chain.resolve.alias
    .set("react$", reactPkg)
    .set("react/jsx-runtime$", path.join(reactPkg, "jsx-runtime.js"))
    .set("react/jsx-dev-runtime$", path.join(reactPkg, "jsx-dev-runtime.js"));
}

/** WeApp: swap H5-only modules and stub heavy node deps so they never enter vendors.js */
function webpackWeappPlatformAliases(chain) {
  const src = path.join(clientRoot, "src");
  const stub = path.join(src, "platform", "stubs", "empty-module.js");
  const webpack = require("webpack");

  chain.resolve.alias
    .set(path.join(src, "platform", "audio.ts"), path.join(src, "platform", "audio.weapp.ts"))
    .set(path.join(src, "utils", "generateQrDataUrl.ts"), path.join(src, "utils", "generateQrDataUrl.weapp.ts"));

  chain.plugin("weapp-stub-hls").use(webpack.NormalModuleReplacementPlugin, [/^hls\.js$/, stub]);
  chain.plugin("weapp-stub-qrcode").use(webpack.NormalModuleReplacementPlugin, [/^qrcode$/, stub]);
}

module.exports = function (merge) {
  const isH5 = process.env.TARO_ENV === "h5";
  const base = {
    projectName: "vibe-sorcery-client",
    date: "2026-7-6",
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: "src",
    outputRoot: isH5 ? "dist-h5" : "dist",
    plugins: ["@tarojs/plugin-framework-react"],
    defineConstants: {
      TARO_APP_API_URL: JSON.stringify(apiUrl),
      NEXT_PUBLIC_API_URL: JSON.stringify(apiUrl),
    },
    copy: {
      patterns: isH5
        ? [{ from: "src/assets/", to: "dist-h5/assets/" }]
        : [{ from: "src/assets/tab/", to: "dist/assets/tab/" }],
      options: {},
    },
    framework: "react",
    compiler: { type: "webpack5", prebundle: { enable: false } },
    alias: {
      "@": path.resolve(__dirname, "..", "src"),
      "@vibe-sorcery/api-client": path.join(packagesRoot, "api-client", "src"),
      "@vibe-sorcery/i18n": path.join(packagesRoot, "i18n", "src"),
      "@vibe-sorcery/types": path.join(packagesRoot, "types", "src"),
      // H5 only — weapp must use Taro's react-dom -> @tarojs/react alias (real react-dom crashes on instanceof HTMLIFrameElement)
      ...(isH5
        ? {
            react: path.dirname(require.resolve("react/package.json", { paths: [clientRoot] })),
            "react-dom": path.dirname(require.resolve("react-dom/package.json", { paths: [clientRoot] })),
          }
        : {}),
    },
    cache: { enable: true },
    sass: {
      resource: [path.resolve(__dirname, "..", "src", "styles", "_tokens.scss")],
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
  };

  const webpackChain = (chain) => {
    webpackPackages(chain);
    webpackResolve(chain);
    if (isH5) {
      webpackSplit(chain);
    } else {
      webpackMiniReactSingleton(chain);
      webpackWeappPlatformAliases(chain);
    }
  };

  if (isH5) {
    return merge({}, base, {
      h5: {
        publicPath: "/",
        staticDirectory: "static",
        router: { mode: isWatch ? "hash" : "browser" },
        devServer: {
          port: 10086,
          host: "0.0.0.0",
          historyApiFallback: {
            index: "/index.html",
            disableDotRule: true,
            rewrites: [{ from: /./, to: "/index.html" }],
          },
          proxy: {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          },
        },
        postcss: { autoprefixer: { enable: true }, cssModules: { enable: false } },
        webpackChain,
      },
    });
  }

  const isWeappProd = process.env.TARO_ENV === "weapp" && process.env.NODE_ENV === "production";
  const optimizeMain =
    process.env.TARO_WEAPP_OPTIMIZE_MAIN === "true" || process.env.TARO_WEAPP_OPTIMIZE_MAIN === "1";

  return merge({}, base, {
    mini: {
      // Production weapp: disable debug React to shrink runtime; keep true in dev/watch.
      debugReact: !isWeappProd,
      // Opt-in: set TARO_WEAPP_OPTIMIZE_MAIN=1 after full subpackage regression.
      optimizeMainPackage: { enable: optimizeMain },
      postcss: { pxtransform: { enable: true, config: {} } },
      // Silence mini-css-extract-plugin Conflicting order noise across shared SCSS.
      miniCssExtractPluginOption: { ignoreOrder: true },
      webpackChain: (chain) => {
        webpackChain(chain);
        try {
          chain.plugin("miniCssExtractPlugin").tap((args) => {
            const opts = args[0] || {};
            args[0] = { ...opts, ignoreOrder: true };
            return args;
          });
        } catch {
          /* plugin name may differ by Taro version */
        }
      },
    },
  });
};
