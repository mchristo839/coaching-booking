"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/auth/login/route";
exports.ids = ["app/api/auth/login/route"];
exports.modules = {

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "punycode":
/*!***************************!*\
  !*** external "punycode" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("punycode");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("stream");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _home_mario_Documents_coaching_project_coaching_booking_app_api_auth_login_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/auth/login/route.ts */ \"(rsc)/./app/api/auth/login/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/auth/login/route\",\n        pathname: \"/api/auth/login\",\n        filename: \"route\",\n        bundlePath: \"app/api/auth/login/route\"\n    },\n    resolvedPagePath: \"/home/mario/Documents/coaching-project/coaching-booking/app/api/auth/login/route.ts\",\n    nextConfigOutput,\n    userland: _home_mario_Documents_coaching_project_coaching_booking_app_api_auth_login_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/auth/login/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZhdXRoJTJGbG9naW4lMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRmF1dGglMkZsb2dpbiUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRmF1dGglMkZsb2dpbiUyRnJvdXRlLnRzJmFwcERpcj0lMkZob21lJTJGbWFyaW8lMkZEb2N1bWVudHMlMkZjb2FjaGluZy1wcm9qZWN0JTJGY29hY2hpbmctYm9va2luZyUyRmFwcCZwYWdlRXh0ZW5zaW9ucz10c3gmcGFnZUV4dGVuc2lvbnM9dHMmcGFnZUV4dGVuc2lvbnM9anN4JnBhZ2VFeHRlbnNpb25zPWpzJnJvb3REaXI9JTJGaG9tZSUyRm1hcmlvJTJGRG9jdW1lbnRzJTJGY29hY2hpbmctcHJvamVjdCUyRmNvYWNoaW5nLWJvb2tpbmcmaXNEZXY9dHJ1ZSZ0c2NvbmZpZ1BhdGg9dHNjb25maWcuanNvbiZiYXNlUGF0aD0mYXNzZXRQcmVmaXg9Jm5leHRDb25maWdPdXRwdXQ9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQ21DO0FBQ2hIO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vY29hY2hpbmctYm9va2luZy8/Mzc2NCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCIvaG9tZS9tYXJpby9Eb2N1bWVudHMvY29hY2hpbmctcHJvamVjdC9jb2FjaGluZy1ib29raW5nL2FwcC9hcGkvYXV0aC9sb2dpbi9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvYXV0aC9sb2dpbi9yb3V0ZVwiLFxuICAgICAgICBwYXRobmFtZTogXCIvYXBpL2F1dGgvbG9naW5cIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL2F1dGgvbG9naW4vcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvaG9tZS9tYXJpby9Eb2N1bWVudHMvY29hY2hpbmctcHJvamVjdC9jb2FjaGluZy1ib29raW5nL2FwcC9hcGkvYXV0aC9sb2dpbi9yb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvYXV0aC9sb2dpbi9yb3V0ZVwiO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICBzZXJ2ZXJIb29rcyxcbiAgICAgICAgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzLCBvcmlnaW5hbFBhdGhuYW1lLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./app/api/auth/login/route.ts":
/*!*************************************!*\
  !*** ./app/api/auth/login/route.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var _app_lib_airtable__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/app/lib/airtable */ \"(rsc)/./app/lib/airtable.ts\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! bcryptjs */ \"(rsc)/./node_modules/bcryptjs/index.js\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(bcryptjs__WEBPACK_IMPORTED_MODULE_2__);\n// app/api/auth/login/route.ts\n\n\n\nasync function POST(request) {\n    try {\n        const { email, password } = await request.json();\n        if (!email || !password) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"Email and password are required\"\n            }, {\n                status: 400\n            });\n        }\n        // Find coach by email\n        const records = await _app_lib_airtable__WEBPACK_IMPORTED_MODULE_1__.coachesTable.select({\n            filterByFormula: `{email} = '${email}'`,\n            maxRecords: 1\n        }).firstPage();\n        if (records.length === 0) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"Invalid email or password\"\n            }, {\n                status: 401\n            });\n        }\n        const coach = records[0];\n        const storedHash = coach.get(\"password_hash\");\n        // Compare passwords\n        const passwordMatch = await bcryptjs__WEBPACK_IMPORTED_MODULE_2___default().compare(password, storedHash);\n        if (!passwordMatch) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"Invalid email or password\"\n            }, {\n                status: 401\n            });\n        }\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            success: true,\n            coachId: coach.id,\n            email: coach.get(\"email\"),\n            name: coach.get(\"name\")\n        });\n    } catch (error) {\n        console.error(\"Login error:\", error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"Login failed. Please try again.\"\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2F1dGgvbG9naW4vcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQSw4QkFBOEI7QUFDeUI7QUFDTjtBQUNwQjtBQUV0QixlQUFlRyxLQUFLQyxPQUFvQjtJQUM3QyxJQUFJO1FBQ0YsTUFBTSxFQUFFQyxLQUFLLEVBQUVDLFFBQVEsRUFBRSxHQUFHLE1BQU1GLFFBQVFHLElBQUk7UUFFOUMsSUFBSSxDQUFDRixTQUFTLENBQUNDLFVBQVU7WUFDdkIsT0FBT04scURBQVlBLENBQUNPLElBQUksQ0FDdEI7Z0JBQUVDLE9BQU87WUFBa0MsR0FDM0M7Z0JBQUVDLFFBQVE7WUFBSTtRQUVsQjtRQUVBLHNCQUFzQjtRQUN0QixNQUFNQyxVQUFVLE1BQU1ULDJEQUFZQSxDQUMvQlUsTUFBTSxDQUFDO1lBQ05DLGlCQUFpQixDQUFDLFdBQVcsRUFBRVAsTUFBTSxDQUFDLENBQUM7WUFDdkNRLFlBQVk7UUFDZCxHQUNDQyxTQUFTO1FBRVosSUFBSUosUUFBUUssTUFBTSxLQUFLLEdBQUc7WUFDeEIsT0FBT2YscURBQVlBLENBQUNPLElBQUksQ0FDdEI7Z0JBQUVDLE9BQU87WUFBNEIsR0FDckM7Z0JBQUVDLFFBQVE7WUFBSTtRQUVsQjtRQUVBLE1BQU1PLFFBQVFOLE9BQU8sQ0FBQyxFQUFFO1FBQ3hCLE1BQU1PLGFBQWFELE1BQU1FLEdBQUcsQ0FBQztRQUU3QixvQkFBb0I7UUFDcEIsTUFBTUMsZ0JBQWdCLE1BQU1qQix1REFBYyxDQUFDSSxVQUFVVztRQUVyRCxJQUFJLENBQUNFLGVBQWU7WUFDbEIsT0FBT25CLHFEQUFZQSxDQUFDTyxJQUFJLENBQ3RCO2dCQUFFQyxPQUFPO1lBQTRCLEdBQ3JDO2dCQUFFQyxRQUFRO1lBQUk7UUFFbEI7UUFFQSxPQUFPVCxxREFBWUEsQ0FBQ08sSUFBSSxDQUFDO1lBQ3ZCYyxTQUFTO1lBQ1RDLFNBQVNOLE1BQU1PLEVBQUU7WUFDakJsQixPQUFPVyxNQUFNRSxHQUFHLENBQUM7WUFDakJNLE1BQU1SLE1BQU1FLEdBQUcsQ0FBQztRQUNsQjtJQUNGLEVBQUUsT0FBT1YsT0FBTztRQUNkaUIsUUFBUWpCLEtBQUssQ0FBQyxnQkFBZ0JBO1FBQzlCLE9BQU9SLHFEQUFZQSxDQUFDTyxJQUFJLENBQ3RCO1lBQUVDLE9BQU87UUFBa0MsR0FDM0M7WUFBRUMsUUFBUTtRQUFJO0lBRWxCO0FBQ0YiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jb2FjaGluZy1ib29raW5nLy4vYXBwL2FwaS9hdXRoL2xvZ2luL3JvdXRlLnRzPzRmMjQiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gYXBwL2FwaS9hdXRoL2xvZ2luL3JvdXRlLnRzXG5pbXBvcnQgeyBOZXh0UmVxdWVzdCwgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInXG5pbXBvcnQgeyBjb2FjaGVzVGFibGUgfSBmcm9tICdAL2FwcC9saWIvYWlydGFibGUnXG5pbXBvcnQgYmNyeXB0IGZyb20gJ2JjcnlwdGpzJ1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXF1ZXN0OiBOZXh0UmVxdWVzdCkge1xuICB0cnkge1xuICAgIGNvbnN0IHsgZW1haWwsIHBhc3N3b3JkIH0gPSBhd2FpdCByZXF1ZXN0Lmpzb24oKVxuXG4gICAgaWYgKCFlbWFpbCB8fCAhcGFzc3dvcmQpIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgICAgeyBlcnJvcjogJ0VtYWlsIGFuZCBwYXNzd29yZCBhcmUgcmVxdWlyZWQnIH0sXG4gICAgICAgIHsgc3RhdHVzOiA0MDAgfVxuICAgICAgKVxuICAgIH1cblxuICAgIC8vIEZpbmQgY29hY2ggYnkgZW1haWxcbiAgICBjb25zdCByZWNvcmRzID0gYXdhaXQgY29hY2hlc1RhYmxlXG4gICAgICAuc2VsZWN0KHtcbiAgICAgICAgZmlsdGVyQnlGb3JtdWxhOiBge2VtYWlsfSA9ICcke2VtYWlsfSdgLFxuICAgICAgICBtYXhSZWNvcmRzOiAxLFxuICAgICAgfSlcbiAgICAgIC5maXJzdFBhZ2UoKVxuXG4gICAgaWYgKHJlY29yZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oXG4gICAgICAgIHsgZXJyb3I6ICdJbnZhbGlkIGVtYWlsIG9yIHBhc3N3b3JkJyB9LFxuICAgICAgICB7IHN0YXR1czogNDAxIH1cbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBjb2FjaCA9IHJlY29yZHNbMF1cbiAgICBjb25zdCBzdG9yZWRIYXNoID0gY29hY2guZ2V0KCdwYXNzd29yZF9oYXNoJykgYXMgc3RyaW5nXG5cbiAgICAvLyBDb21wYXJlIHBhc3N3b3Jkc1xuICAgIGNvbnN0IHBhc3N3b3JkTWF0Y2ggPSBhd2FpdCBiY3J5cHQuY29tcGFyZShwYXNzd29yZCwgc3RvcmVkSGFzaClcblxuICAgIGlmICghcGFzc3dvcmRNYXRjaCkge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgICB7IGVycm9yOiAnSW52YWxpZCBlbWFpbCBvciBwYXNzd29yZCcgfSxcbiAgICAgICAgeyBzdGF0dXM6IDQwMSB9XG4gICAgICApXG4gICAgfVxuXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBjb2FjaElkOiBjb2FjaC5pZCxcbiAgICAgIGVtYWlsOiBjb2FjaC5nZXQoJ2VtYWlsJyksXG4gICAgICBuYW1lOiBjb2FjaC5nZXQoJ25hbWUnKSxcbiAgICB9KVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0xvZ2luIGVycm9yOicsIGVycm9yKVxuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgIHsgZXJyb3I6ICdMb2dpbiBmYWlsZWQuIFBsZWFzZSB0cnkgYWdhaW4uJyB9LFxuICAgICAgeyBzdGF0dXM6IDUwMCB9XG4gICAgKVxuICB9XG59XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiY29hY2hlc1RhYmxlIiwiYmNyeXB0IiwiUE9TVCIsInJlcXVlc3QiLCJlbWFpbCIsInBhc3N3b3JkIiwianNvbiIsImVycm9yIiwic3RhdHVzIiwicmVjb3JkcyIsInNlbGVjdCIsImZpbHRlckJ5Rm9ybXVsYSIsIm1heFJlY29yZHMiLCJmaXJzdFBhZ2UiLCJsZW5ndGgiLCJjb2FjaCIsInN0b3JlZEhhc2giLCJnZXQiLCJwYXNzd29yZE1hdGNoIiwiY29tcGFyZSIsInN1Y2Nlc3MiLCJjb2FjaElkIiwiaWQiLCJuYW1lIiwiY29uc29sZSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./app/api/auth/login/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/lib/airtable.ts":
/*!*****************************!*\
  !*** ./app/lib/airtable.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   bookingsTable: () => (/* binding */ bookingsTable),\n/* harmony export */   coachesTable: () => (/* binding */ coachesTable),\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__),\n/* harmony export */   sessionsTable: () => (/* binding */ sessionsTable)\n/* harmony export */ });\n/* harmony import */ var airtable__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! airtable */ \"(rsc)/./node_modules/airtable/lib/airtable.js\");\n/* harmony import */ var airtable__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(airtable__WEBPACK_IMPORTED_MODULE_0__);\n// app/lib/airtable.ts\n// SERVER-SIDE ONLY: Never import this in client components (pages).\n// All client components call fetch('/api/...') instead.\n\nconst base = new (airtable__WEBPACK_IMPORTED_MODULE_0___default())({\n    apiKey: process.env.AIRTABLE_API_TOKEN\n}).base(\"app0TNasJdiqvLQAJ\");\nconst coachesTable = base(\"Coaches\");\nconst sessionsTable = base(\"Sessions\");\nconst bookingsTable = base(\"Bookings\");\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (base);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvbGliL2FpcnRhYmxlLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHNCQUFzQjtBQUN0QixvRUFBb0U7QUFDcEUsd0RBQXdEO0FBRXpCO0FBRS9CLE1BQU1DLE9BQU8sSUFBSUQsaURBQVFBLENBQUM7SUFDeEJFLFFBQVFDLFFBQVFDLEdBQUcsQ0FBQ0Msa0JBQWtCO0FBQ3hDLEdBQUdKLElBQUksQ0FBQ0UsbUJBQXdDO0FBRXpDLE1BQU1JLGVBQWVOLEtBQUssV0FBVTtBQUNwQyxNQUFNTyxnQkFBZ0JQLEtBQUssWUFBVztBQUN0QyxNQUFNUSxnQkFBZ0JSLEtBQUssWUFBVztBQUU3QyxpRUFBZUEsSUFBSUEsRUFBQSIsInNvdXJjZXMiOlsid2VicGFjazovL2NvYWNoaW5nLWJvb2tpbmcvLi9hcHAvbGliL2FpcnRhYmxlLnRzPzFjNmYiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gYXBwL2xpYi9haXJ0YWJsZS50c1xuLy8gU0VSVkVSLVNJREUgT05MWTogTmV2ZXIgaW1wb3J0IHRoaXMgaW4gY2xpZW50IGNvbXBvbmVudHMgKHBhZ2VzKS5cbi8vIEFsbCBjbGllbnQgY29tcG9uZW50cyBjYWxsIGZldGNoKCcvYXBpLy4uLicpIGluc3RlYWQuXG5cbmltcG9ydCBBaXJ0YWJsZSBmcm9tICdhaXJ0YWJsZSdcblxuY29uc3QgYmFzZSA9IG5ldyBBaXJ0YWJsZSh7XG4gIGFwaUtleTogcHJvY2Vzcy5lbnYuQUlSVEFCTEVfQVBJX1RPS0VOLFxufSkuYmFzZShwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19BSVJUQUJMRV9CQVNFX0lEISlcblxuZXhwb3J0IGNvbnN0IGNvYWNoZXNUYWJsZSA9IGJhc2UoJ0NvYWNoZXMnKVxuZXhwb3J0IGNvbnN0IHNlc3Npb25zVGFibGUgPSBiYXNlKCdTZXNzaW9ucycpXG5leHBvcnQgY29uc3QgYm9va2luZ3NUYWJsZSA9IGJhc2UoJ0Jvb2tpbmdzJylcblxuZXhwb3J0IGRlZmF1bHQgYmFzZVxuIl0sIm5hbWVzIjpbIkFpcnRhYmxlIiwiYmFzZSIsImFwaUtleSIsInByb2Nlc3MiLCJlbnYiLCJBSVJUQUJMRV9BUElfVE9LRU4iLCJORVhUX1BVQkxJQ19BSVJUQUJMRV9CQVNFX0lEIiwiY29hY2hlc1RhYmxlIiwic2Vzc2lvbnNUYWJsZSIsImJvb2tpbmdzVGFibGUiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/lib/airtable.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/tr46","vendor-chunks/airtable","vendor-chunks/lodash","vendor-chunks/node-fetch","vendor-chunks/whatwg-url","vendor-chunks/event-target-shim","vendor-chunks/abortcontroller-polyfill","vendor-chunks/webidl-conversions","vendor-chunks/abort-controller","vendor-chunks/bcryptjs"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fhome%2Fmario%2FDocuments%2Fcoaching-project%2Fcoaching-booking&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();