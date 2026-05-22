<script setup>
// @ts-nocheck

import { StatefulLayout } from '@json-layout/core/state'
import { ref, shallowRef, getCurrentInstance, useSlots, computed } from 'vue'
import { useElementSize } from '@vueuse/core'

import Tree from '@koumoul/vjsf/components/tree.vue'
import { useVjsf, emits } from '@koumoul/vjsf/composables/use-vjsf.js'
import '@koumoul/vjsf/styles/vjsf.css'


import sectionNode from '@koumoul/vjsf/components/nodes/section.vue'

import textfieldNode from '@koumoul/vjsf/components/nodes/text-field.vue'

import textareaNode from '@koumoul/vjsf/components/nodes/textarea.vue'

import comboboxNode from '@koumoul/vjsf/components/nodes/combobox.vue'

import switchNode from '@koumoul/vjsf/components/nodes/switch.vue'

import listNode from '@koumoul/vjsf/components/nodes/list.vue'

import autocompleteNode from '@koumoul/vjsf/components/nodes/autocomplete.vue'

import selectNode from '@koumoul/vjsf/components/nodes/select.vue'


import localizeErrors from "ajv-i18n/localize/fr/index.js";
import { fullFormats } from "ajv-formats/dist/formats.js";

const schema26 = {"$id":"export0","$ref":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"};
const schema28 = {"type":"object","title":"Compte","additionalProperties":false,"required":["type","id","name"],"properties":{"type":{"type":"string","enum":["user","organization"],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type","errorMessage":{}},"id":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id","errorMessage":{}},"name":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name","errorMessage":{}}},"layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/accounts?size=20","pure":true,"dataAlias":"value","ref":6},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":3},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":7},"itemKey":{"type":"js-eval","expr":"`${item.type}:${item.id}`","pure":true,"dataAlias":"item","ref":8},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":9},"returnObjects":true}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire","name":"information obligatoire"}}};
const obj0 = {"required":"missingProperty","dependencies":"property","dependentRequired":"property"};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export0" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema28.required,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema28.required,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.name === undefined){
const err2 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'",schema:schema28.required,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "type") || (key0 === "id")) || (key0 === "name"))){
const err3 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.type.type,parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!((data0 === "user") || (data0 === "organization"))){
const err5 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema28.properties.type.enum},message:"must be equal to one of the allowed values",schema:schema28.properties.type.enum,parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err6 of vErrors){
if(!err6.emUsed){
emErrs0.push(err6);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.id.type,parentSchema:schema28.properties.id,data:data1};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err8 of vErrors){
if(!err8.emUsed){
emErrs1.push(err8);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/name",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.name.type,parentSchema:schema28.properties.name,data:data2};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(errors > 0){
const emErrs2 = [];
for(const err10 of vErrors){
if(!err10.emUsed){
emErrs2.push(err10);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
}
}
else {
const err11 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema28.type,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[],"name":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err12 of vErrors){
if((((((err12.keyword !== "errorMessage") && (!err12.emUsed)) && (err12.instancePath === instancePath)) && (err12.keyword in emErrors0)) && (err12.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err12.schemaPath.slice(92)))){
emPropParams0 = obj0[err12.keyword];
emParamsErrors0 = emErrors0[err12.keyword][err12.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err12);
err12.emUsed = true;
}
}
}
for(const key1 in emErrors0){
for(const keyProp0 in emErrors0[key1]){
emParamsErrors0 = emErrors0[key1][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key1] && templates0[key1][keyProp0];
const err13 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema28.errorMessage[key1][keyProp0],schema:schema28.errorMessage,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
const emErrs3 = [];
for(const err14 of vErrors){
if(!err14.emUsed){
emErrs3.push(err14);
}
}
vErrors = emErrs3;
errors = emErrs3.length;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema29 = {"$id":"export1","$ref":"https://github.com/data-fair/registry/artefact-patch#"};
const schema27 = {"$id":"https://github.com/data-fair/registry/artefact-patch","x-exports":["validate","types","vjsf"],"x-vjsf":{"xI18n":true},"x-vjsf-locales":["en","fr"],"title":"Artefact patch","type":"object","additionalProperties":false,"layout":{"title":null},"properties":{"title":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"en":{"type":"string","title":"Titre - Anglais","layout":{"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en","errorMessage":{}},"fr":{"type":"string","title":"Titre - Français","layout":{"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title","errorMessage":{}},"description":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"en":{"type":"string","title":"Description - Anglais","layout":{"comp":"textarea","props":{"autoGrow":true,"rows":3},"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en","errorMessage":{}},"fr":{"type":"string","title":"Description - Français","layout":{"comp":"textarea","props":{"autoGrow":true,"rows":3},"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description","errorMessage":{}},"group":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"en":{"type":"string","title":"Groupe - Anglais","layout":{"comp":"combobox","cols":{"md":6},"getItems":{"url":{"type":"js-tpl","expr":"${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=en","pure":true,"dataAlias":"value","ref":2},"itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":3}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en","errorMessage":{}},"fr":{"type":"string","title":"Groupe - Français","layout":{"comp":"combobox","cols":{"md":6},"getItems":{"url":{"type":"js-tpl","expr":"${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=fr","pure":true,"dataAlias":"value","ref":4},"itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":3}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/group","errorMessage":{}},"deprecated":{"anyOf":[{"type":"boolean","title":"Déprécié","layout":"switch","default":false},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/deprecated","errorMessage":{}},"public":{"anyOf":[{"type":"boolean","title":"Public","layout":"switch","default":false},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/public","errorMessage":{}},"privateAccess":{"anyOf":[{"type":"array","title":"Accès privés","layout":{"if":"!parent.data?.public"},"items":{"type":"object","title":"Compte","additionalProperties":false,"required":["type","id","name"],"properties":{"type":{"type":"string","enum":["user","organization"],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type","errorMessage":{}},"id":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id","errorMessage":{}},"name":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name","errorMessage":{}}},"layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/accounts?size=20","pure":true,"dataAlias":"value","ref":6},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":3},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":7},"itemKey":{"type":"js-eval","expr":"`${item.type}:${item.id}`","pure":true,"dataAlias":"item","ref":8},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":9},"returnObjects":true}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire","name":"information obligatoire"}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess","errorMessage":{}},"documentation":{"anyOf":[{"type":"string","format":"uri","title":"URL de documentation"},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/documentation","errorMessage":{}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#","errorMessage":{}};
const formats0 = fullFormats.uri;

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export1" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(((((((key0 === "title") || (key0 === "description")) || (key0 === "group")) || (key0 === "deprecated")) || (key0 === "public")) || (key0 === "privateAccess")) || (key0 === "documentation"))){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema27,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.title !== undefined){
let data0 = data.title;
const _errs4 = errors;
let valid2 = false;
const _errs5 = errors;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
for(const key1 in data0){
if(!((key1 === "en") || (key1 === "fr"))){
const err1 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.title.anyOf[0],data:data0};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data0.en !== undefined){
let data1 = data0.en;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/title/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.en.type,parentSchema:schema27.properties.title.anyOf[0].properties.en,data:data1};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err3 of vErrors){
if(!err3.emUsed){
emErrs0.push(err3);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data0.fr !== undefined){
let data2 = data0.fr;
if(typeof data2 !== "string"){
const err4 = {instancePath:instancePath+"/title/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.fr.type,parentSchema:schema27.properties.title.anyOf[0].properties.fr,data:data2};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err5 of vErrors){
if(!err5.emUsed){
emErrs1.push(err5);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err6 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.title.anyOf[0].type,parentSchema:schema27.properties.title.anyOf[0],data:data0};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid2 = valid2 || _valid0;
const _errs12 = errors;
if(data0 !== null){
const err7 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.title.anyOf[1].type,parentSchema:schema27.properties.title.anyOf[1],data:data0};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs12 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err8 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.title.anyOf,parentSchema:schema27.properties.title,data:data0};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs2 = [];
for(const err9 of vErrors){
if(!err9.emUsed){
emErrs2.push(err9);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
}
if(data.description !== undefined){
let data3 = data.description;
const _errs15 = errors;
let valid4 = false;
const _errs16 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
for(const key2 in data3){
if(!((key2 === "en") || (key2 === "fr"))){
const err10 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.description.anyOf[0],data:data3};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data3.en !== undefined){
let data4 = data3.en;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/description/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.en.type,parentSchema:schema27.properties.description.anyOf[0].properties.en,data:data4};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(errors > 0){
const emErrs3 = [];
for(const err12 of vErrors){
if(!err12.emUsed){
emErrs3.push(err12);
}
}
vErrors = emErrs3;
errors = emErrs3.length;
}
}
if(data3.fr !== undefined){
let data5 = data3.fr;
if(typeof data5 !== "string"){
const err13 = {instancePath:instancePath+"/description/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.fr.type,parentSchema:schema27.properties.description.anyOf[0].properties.fr,data:data5};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(errors > 0){
const emErrs4 = [];
for(const err14 of vErrors){
if(!err14.emUsed){
emErrs4.push(err14);
}
}
vErrors = emErrs4;
errors = emErrs4.length;
}
}
}
else {
const err15 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.description.anyOf[0].type,parentSchema:schema27.properties.description.anyOf[0],data:data3};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs16 === errors;
valid4 = valid4 || _valid1;
const _errs23 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.description.anyOf[1].type,parentSchema:schema27.properties.description.anyOf[1],data:data3};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs23 === errors;
valid4 = valid4 || _valid1;
if(!valid4){
const err17 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.description.anyOf,parentSchema:schema27.properties.description,data:data3};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs15;
if(vErrors !== null){
if(_errs15){
vErrors.length = _errs15;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs5 = [];
for(const err18 of vErrors){
if(!err18.emUsed){
emErrs5.push(err18);
}
}
vErrors = emErrs5;
errors = emErrs5.length;
}
}
if(data.group !== undefined){
let data6 = data.group;
const _errs26 = errors;
let valid6 = false;
const _errs27 = errors;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
for(const key3 in data6){
if(!((key3 === "en") || (key3 === "fr"))){
const err19 = {instancePath:instancePath+"/group",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.group.anyOf[0],data:data6};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data6.en !== undefined){
let data7 = data6.en;
if(typeof data7 !== "string"){
const err20 = {instancePath:instancePath+"/group/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.group.anyOf[0].properties.en.type,parentSchema:schema27.properties.group.anyOf[0].properties.en,data:data7};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(errors > 0){
const emErrs6 = [];
for(const err21 of vErrors){
if(!err21.emUsed){
emErrs6.push(err21);
}
}
vErrors = emErrs6;
errors = emErrs6.length;
}
}
if(data6.fr !== undefined){
let data8 = data6.fr;
if(typeof data8 !== "string"){
const err22 = {instancePath:instancePath+"/group/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.group.anyOf[0].properties.fr.type,parentSchema:schema27.properties.group.anyOf[0].properties.fr,data:data8};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(errors > 0){
const emErrs7 = [];
for(const err23 of vErrors){
if(!err23.emUsed){
emErrs7.push(err23);
}
}
vErrors = emErrs7;
errors = emErrs7.length;
}
}
}
else {
const err24 = {instancePath:instancePath+"/group",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.group.anyOf[0].type,parentSchema:schema27.properties.group.anyOf[0],data:data6};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid2 = _errs27 === errors;
valid6 = valid6 || _valid2;
const _errs34 = errors;
if(data6 !== null){
const err25 = {instancePath:instancePath+"/group",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.group.anyOf[1].type,parentSchema:schema27.properties.group.anyOf[1],data:data6};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid2 = _errs34 === errors;
valid6 = valid6 || _valid2;
if(!valid6){
const err26 = {instancePath:instancePath+"/group",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.group.anyOf,parentSchema:schema27.properties.group,data:data6};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
else {
errors = _errs26;
if(vErrors !== null){
if(_errs26){
vErrors.length = _errs26;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs8 = [];
for(const err27 of vErrors){
if(!err27.emUsed){
emErrs8.push(err27);
}
}
vErrors = emErrs8;
errors = emErrs8.length;
}
}
if(data.deprecated !== undefined){
let data9 = data.deprecated;
const _errs37 = errors;
let valid8 = false;
const _errs38 = errors;
if(typeof data9 !== "boolean"){
const err28 = {instancePath:instancePath+"/deprecated",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf/0/type",keyword:"type",params:{type: "boolean"},message:"must be boolean",schema:schema27.properties.deprecated.anyOf[0].type,parentSchema:schema27.properties.deprecated.anyOf[0],data:data9};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid3 = _errs38 === errors;
valid8 = valid8 || _valid3;
const _errs40 = errors;
if(data9 !== null){
const err29 = {instancePath:instancePath+"/deprecated",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.deprecated.anyOf[1].type,parentSchema:schema27.properties.deprecated.anyOf[1],data:data9};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var _valid3 = _errs40 === errors;
valid8 = valid8 || _valid3;
if(!valid8){
const err30 = {instancePath:instancePath+"/deprecated",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.deprecated.anyOf,parentSchema:schema27.properties.deprecated,data:data9};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
errors = _errs37;
if(vErrors !== null){
if(_errs37){
vErrors.length = _errs37;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs9 = [];
for(const err31 of vErrors){
if(!err31.emUsed){
emErrs9.push(err31);
}
}
vErrors = emErrs9;
errors = emErrs9.length;
}
}
if(data.public !== undefined){
let data10 = data.public;
const _errs43 = errors;
let valid9 = false;
const _errs44 = errors;
if(typeof data10 !== "boolean"){
const err32 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0/type",keyword:"type",params:{type: "boolean"},message:"must be boolean",schema:schema27.properties.public.anyOf[0].type,parentSchema:schema27.properties.public.anyOf[0],data:data10};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid4 = _errs44 === errors;
valid9 = valid9 || _valid4;
const _errs46 = errors;
if(data10 !== null){
const err33 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.public.anyOf[1].type,parentSchema:schema27.properties.public.anyOf[1],data:data10};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid4 = _errs46 === errors;
valid9 = valid9 || _valid4;
if(!valid9){
const err34 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.public.anyOf,parentSchema:schema27.properties.public,data:data10};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
errors = _errs43;
if(vErrors !== null){
if(_errs43){
vErrors.length = _errs43;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs10 = [];
for(const err35 of vErrors){
if(!err35.emUsed){
emErrs10.push(err35);
}
}
vErrors = emErrs10;
errors = emErrs10.length;
}
}
if(data.privateAccess !== undefined){
let data11 = data.privateAccess;
const _errs49 = errors;
let valid10 = false;
const _errs50 = errors;
if(Array.isArray(data11)){
const len0 = data11.length;
for(let i0=0; i0<len0; i0++){
let data12 = data11[i0];
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.type === undefined){
const err36 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.required,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data12.id === undefined){
const err37 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.required,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data12.name === undefined){
const err38 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.required,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
for(const key4 in data12){
if(!(((key4 === "type") || (key4 === "id")) || (key4 === "name"))){
const err39 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data12.type !== undefined){
let data13 = data12.type;
if(typeof data13 !== "string"){
const err40 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.properties.type.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.type,data:data13};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(!((data13 === "user") || (data13 === "organization"))){
const err41 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema27.properties.privateAccess.anyOf[0].items.properties.type.enum},message:"must be equal to one of the allowed values",schema:schema27.properties.privateAccess.anyOf[0].items.properties.type.enum,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.type,data:data13};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(errors > 0){
const emErrs11 = [];
for(const err42 of vErrors){
if(!err42.emUsed){
emErrs11.push(err42);
}
}
vErrors = emErrs11;
errors = emErrs11.length;
}
}
if(data12.id !== undefined){
let data14 = data12.id;
if(typeof data14 !== "string"){
const err43 = {instancePath:instancePath+"/privateAccess/" + i0+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.properties.id.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.id,data:data14};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(errors > 0){
const emErrs12 = [];
for(const err44 of vErrors){
if(!err44.emUsed){
emErrs12.push(err44);
}
}
vErrors = emErrs12;
errors = emErrs12.length;
}
}
if(data12.name !== undefined){
let data15 = data12.name;
if(typeof data15 !== "string"){
const err45 = {instancePath:instancePath+"/privateAccess/" + i0+"/name",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.properties.name.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.name,data:data15};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(errors > 0){
const emErrs13 = [];
for(const err46 of vErrors){
if(!err46.emUsed){
emErrs13.push(err46);
}
}
vErrors = emErrs13;
errors = emErrs13.length;
}
}
}
else {
const err47 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.privateAccess.anyOf[0].items.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[],"name":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err48 of vErrors){
if((((((err48.keyword !== "errorMessage") && (!err48.emUsed)) && (err48.instancePath === instancePath+"/privateAccess/" + i0)) && (err48.keyword in emErrors0)) && (err48.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err48.schemaPath.slice(92)))){
emPropParams0 = obj0[err48.keyword];
emParamsErrors0 = emErrors0[err48.keyword][err48.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err48);
err48.emUsed = true;
}
}
}
for(const key5 in emErrors0){
for(const keyProp0 in emErrors0[key5]){
emParamsErrors0 = emErrors0[key5][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key5] && templates0[key5][keyProp0];
const err49 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema27.properties.privateAccess.anyOf[0].items.errorMessage[key5][keyProp0],schema:schema27.properties.privateAccess.anyOf[0].items.errorMessage,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data12};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
const emErrs14 = [];
for(const err50 of vErrors){
if(!err50.emUsed){
emErrs14.push(err50);
}
}
vErrors = emErrs14;
errors = emErrs14.length;
}
}
}
else {
const err51 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/type",keyword:"type",params:{type: "array"},message:"must be array",schema:schema27.properties.privateAccess.anyOf[0].type,parentSchema:schema27.properties.privateAccess.anyOf[0],data:data11};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
var _valid5 = _errs50 === errors;
valid10 = valid10 || _valid5;
const _errs61 = errors;
if(data11 !== null){
const err52 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.privateAccess.anyOf[1].type,parentSchema:schema27.properties.privateAccess.anyOf[1],data:data11};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var _valid5 = _errs61 === errors;
valid10 = valid10 || _valid5;
if(!valid10){
const err53 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.privateAccess.anyOf,parentSchema:schema27.properties.privateAccess,data:data11};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
else {
errors = _errs49;
if(vErrors !== null){
if(_errs49){
vErrors.length = _errs49;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs15 = [];
for(const err54 of vErrors){
if(!err54.emUsed){
emErrs15.push(err54);
}
}
vErrors = emErrs15;
errors = emErrs15.length;
}
}
if(data.documentation !== undefined){
let data16 = data.documentation;
const _errs64 = errors;
let valid14 = false;
const _errs65 = errors;
if(typeof data16 === "string"){
if(!(formats0(data16))){
const err55 = {instancePath:instancePath+"/documentation",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/0/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\"",schema:"uri",parentSchema:schema27.properties.documentation.anyOf[0],data:data16};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/documentation",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.documentation.anyOf[0].type,parentSchema:schema27.properties.documentation.anyOf[0],data:data16};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var _valid6 = _errs65 === errors;
valid14 = valid14 || _valid6;
const _errs67 = errors;
if(data16 !== null){
const err57 = {instancePath:instancePath+"/documentation",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.documentation.anyOf[1].type,parentSchema:schema27.properties.documentation.anyOf[1],data:data16};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid6 = _errs67 === errors;
valid14 = valid14 || _valid6;
if(!valid14){
const err58 = {instancePath:instancePath+"/documentation",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.documentation.anyOf,parentSchema:schema27.properties.documentation,data:data16};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs64;
if(vErrors !== null){
if(_errs64){
vErrors.length = _errs64;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs16 = [];
for(const err59 of vErrors){
if(!err59.emUsed){
emErrs16.push(err59);
}
}
vErrors = emErrs16;
errors = emErrs16.length;
}
}
}
else {
const err60 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.type,parentSchema:schema27,data};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(errors > 0){
const emErrs17 = [];
for(const err61 of vErrors){
if(!err61.emUsed){
emErrs17.push(err61);
}
}
vErrors = emErrs17;
errors = emErrs17.length;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
function expression0(data,value,options,context,display,layout,readOnly,summary,validates
) {
return (layout.defaultData)
}function expression1(data,value,options,context,display,layout,readOnly,summary,validates
) {
return (layout.props)
}function expression2(data,value,options,context,display,layout,readOnly,summary,validates
) {
return `${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=en`
}function expression3(data,body,options,context,display,layout,readOnly,summary,validates
) {
return (data.results)
}function expression4(data,value,options,context,display,layout,readOnly,summary,validates
) {
return `${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=fr`
}function expression5(data,value,options,context,display,layout,readOnly,summary,validates,rootData,parent
) {
return (!parent.data?.public)
}function expression6(data,value,options,context,display,layout,readOnly,summary,validates
) {
return `/simple-directory/api/accounts?size=20`
}function expression7(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`${item.name} (${item.id})`)
}function expression8(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`${item.type}:${item.id}`)
}function expression9(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`)
}function expression10(data,value,options,context,display,layout,readOnly,summary,validates
) {
return ([{"key":"user","title":"user","value":"user"},{"key":"organization","title":"organization","value":"organization"}])
}

const compiledLayout = {
  mainTree: "https://github.com/data-fair/registry/artefact-patch#",

  skeletonTrees: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: "Artefact patch",
      root: "https://github.com/data-fair/registry/artefact-patch#",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#",
      discriminatorValue: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      title: "Compte",
      root: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      discriminatorValue: undefined
    }
  },

  skeletonNodes: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: "Artefact patch",
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#",
      pure: false,
      propertyKeys: ["title", "description", "group", "deprecated", "public", "privateAccess", "documentation"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/title", "https://github.com/data-fair/registry/artefact-patch#/properties/description", "https://github.com/data-fair/registry/artefact-patch#/properties/group", "https://github.com/data-fair/registry/artefact-patch#/properties/deprecated", "https://github.com/data-fair/registry/artefact-patch#/properties/public", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess", "https://github.com/data-fair/registry/artefact-patch#/properties/documentation"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title": {
      title: undefined,
      key: "title",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      pure: true,
      propertyKeys: ["en", "fr"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en", "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      title: "Titre - Anglais",
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      title: "Titre - Français",
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description": {
      title: undefined,
      key: "description",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0",
      pure: true,
      propertyKeys: ["en", "fr"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en", "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      title: "Description - Anglais",
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      title: "Description - Français",
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group": {
      title: undefined,
      key: "group",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0",
      pure: true,
      propertyKeys: ["en", "fr"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en", "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en": {
      title: "Groupe - Anglais",
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr": {
      title: "Groupe - Français",
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/deprecated": {
      title: "Déprécié",
      key: "deprecated",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public": {
      title: "Public",
      key: "public",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess": {
      title: "Accès privés",
      key: "privateAccess",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      pure: false,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      childrenTrees: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      title: "Compte",
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      pure: true,
      propertyKeys: ["type", "id", "name"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type": {
      title: undefined,
      key: "type",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id": {
      title: undefined,
      key: "id",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name": {
      title: undefined,
      key: "name",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/documentation": {
      title: "URL de documentation",
      key: "documentation",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    }
  },

  normalizedLayouts: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: null,
      comp: "section",

      children: [{
        key: "title"
      }, {
        key: "description"
      }, {
        key: "group"
      }, {
        key: "deprecated"
      }, {
        key: "public"
      }, {
        key: "privateAccess"
      }, {
        key: "documentation"
      }],

      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "en"
      }, {
        key: "fr"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      cols: {
        xs: 12,
        md: 6
      },

      comp: "text-field",
      label: "Titre - Anglais"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      cols: {
        xs: 12,
        md: 6
      },

      comp: "text-field",
      label: "Titre - Français"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "en"
      }, {
        key: "fr"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      comp: "textarea",

      props: {
        autoGrow: true,
        rows: 3
      },

      cols: {
        xs: 12,
        md: 6
      },

      label: "Description - Anglais",

      getProps: {
        type: "js-eval",
        expr: "layout.props",
        pure: true,
        dataAlias: "value",
        ref: 1
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      comp: "textarea",

      props: {
        autoGrow: true,
        rows: 3
      },

      cols: {
        xs: 12,
        md: 6
      },

      label: "Description - Français",

      getProps: {
        type: "js-eval",
        expr: "layout.props",
        pure: true,
        dataAlias: "value",
        ref: 1
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "en"
      }, {
        key: "fr"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/en": {
      comp: "combobox",

      cols: {
        xs: 12,
        md: 6
      },

      getItems: {
        url: {
          type: "js-tpl",
          expr: "${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=en",
          pure: true,
          dataAlias: "value",
          ref: 2
        },

        itemsResults: {
          type: "js-eval",
          expr: "data.results",
          pure: true,
          dataAlias: "body",
          ref: 3
        }
      },

      label: "Groupe - Anglais"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/group/anyOf/0/properties/fr": {
      comp: "combobox",

      cols: {
        xs: 12,
        md: 6
      },

      getItems: {
        url: {
          type: "js-tpl",
          expr: "${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=fr",
          pure: true,
          dataAlias: "value",
          ref: 4
        },

        itemsResults: {
          type: "js-eval",
          expr: "data.results",
          pure: true,
          dataAlias: "body",
          ref: 3
        }
      },

      label: "Groupe - Français"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/deprecated/anyOf/0": {
      comp: "switch",
      nullable: true,
      label: "Déprécié",
      defaultData: false,

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0": {
      comp: "switch",
      nullable: true,
      label: "Public",
      defaultData: false,

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0": {
      if: {
        type: "js-eval",
        expr: "!parent.data?.public",
        pure: false,
        dataAlias: "value",
        ref: 5
      },

      comp: "list",
      nullable: true,
      title: "Accès privés",
      listEditMode: "inline-single",
      listActions: ["add", "edit", "delete", "sort", "duplicate"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      getItems: {
        url: {
          type: "js-tpl",
          expr: "/simple-directory/api/accounts?size=20",
          pure: true,
          dataAlias: "value",
          ref: 6
        },

        qSearchParam: "q",

        itemsResults: {
          type: "js-eval",
          expr: "data.results",
          pure: true,
          dataAlias: "body",
          ref: 3
        },

        itemTitle: {
          type: "js-eval",
          expr: "`${item.name} (${item.id})`",
          pure: true,
          dataAlias: "item",
          ref: 7
        },

        itemKey: {
          type: "js-eval",
          expr: "`${item.type}:${item.id}`",
          pure: true,
          dataAlias: "item",
          ref: 8
        },

        itemIcon: {
          type: "js-eval",
          expr: "`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`",
          pure: true,
          dataAlias: "item",
          ref: 9
        },

        returnObjects: true
      },

      comp: "autocomplete",
      label: "Compte",
      nullable: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type": {
      comp: "select",

      getItems: {
        pure: true,
        type: "js-eval",
        dataAlias: "value",
        expr: "[{\"key\":\"user\",\"title\":\"user\",\"value\":\"user\"},{\"key\":\"organization\",\"title\":\"organization\",\"value\":\"organization\"}]",
        immutable: true,
        ref: 10
      },

      label: "type"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id": {
      comp: "text-field",
      label: "id"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/name": {
      comp: "text-field",
      label: "name"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/documentation/anyOf/0": {
      comp: "text-field",
      nullable: true,
      label: "URL de documentation"
    }
  },

  validates: {
    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": validate22,
    "https://github.com/data-fair/registry/artefact-patch#": validate24
  },

  validationErrors: {},
  expressions: [expression0, expression1, expression2, expression3, expression4, expression5, expression6, expression7, expression8, expression9, expression10],
  locale: "fr",

  messages: {
    errorOneOf: "choisissez une valeur",
    errorRequired: "information obligatoire",
    addItem: "Ajouter un élément",
    delete: "Supprimer",
    edit: "Éditer",
    confirm: "Confirmer",
    close: "Fermer",
    duplicate: "Dupliquer",
    copy: "Copier",
    paste: "Coller",
    sort: "Trier",
    up: "Décaler vers le haut",
    down: "Décaler vers le bas",
    showHelp: "Afficher un message d'aide",
    default: "défaut : ",
    name: "nom : ",
    examples: "Exemples : ",
    deprecated: "Attention, cette information est obsolète.",
    keyboardDate: "JJ/MM/AAAA",
    keyboardDateTime: "JJ/MM/AAAA HH:mm"
  },

  components: {
    none: {
      name: "none"
    },

    slot: {
      name: "slot"
    },

    "composite-slot": {
      name: "composite-slot",
      composite: true
    },

    section: {
      name: "section",
      composite: true
    },

    tabs: {
      name: "tabs",
      composite: true
    },

    "vertical-tabs": {
      name: "vertical-tabs",
      composite: true
    },

    "expansion-panels": {
      name: "expansion-panels",
      composite: true
    },

    stepper: {
      name: "stepper",
      composite: true
    },

    card: {
      name: "card",
      composite: true
    },

    list: {
      name: "list",
      itemsBased: true,

      schema: {
        required: ["listEditMode", "listActions"],

        properties: {
          title: {
            type: "string"
          },

          listEditMode: {
            type: "string",
            enum: ["inline", "inline-single", "menu", "dialog"]
          },

          listActions: {
            type: "array",

            items: {
              type: "string",
              enum: ["add", "edit", "delete", "sort", "duplicate", "copy", "paste"]
            }
          },

          clipboardKey: {
            type: "string"
          },

          itemTitle: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          itemSubtitle: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          itemCopy: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          indexed: {
            type: "array",

            items: {
              type: "string"
            }
          },

          messages: {
            type: "object",
            additionalProperties: false,

            properties: {
              addItem: {
                type: "string"
              },

              delete: {
                type: "string"
              },

              edit: {
                type: "string"
              },

              duplicate: {
                type: "string"
              },

              sort: {
                type: "string"
              }
            }
          }
        }
      }
    },

    "text-field": {
      name: "text-field",
      shouldDebounce: true,
      focusable: true,
      emitsBlur: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    textarea: {
      name: "textarea",
      shouldDebounce: true,
      focusable: true,
      emitsBlur: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          },

          rows: {
            type: "number"
          }
        }
      }
    },

    "number-field": {
      name: "number-field",
      shouldDebounce: true,
      focusable: true,

      schema: {
        properties: {
          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          },

          precision: {
            type: "number"
          },

          placeholder: {
            type: "string"
          }
        }
      }
    },

    checkbox: {
      name: "checkbox"
    },

    switch: {
      name: "switch"
    },

    slider: {
      name: "slider",
      shouldDebounce: true,

      schema: {
        properties: {
          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          }
        }
      }
    },

    "date-picker": {
      name: "date-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "date"
          },

          max: {
            type: "string",
            format: "date"
          },

          format: {
            type: "string",
            enum: ["date", "date-time"],
            default: "date"
          }
        }
      }
    },

    "date-time-picker": {
      name: "date-time-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "date-time"
          },

          max: {
            type: "string",
            format: "date-time"
          }
        }
      }
    },

    "time-picker": {
      name: "time-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "time"
          },

          max: {
            type: "string",
            format: "time"
          }
        }
      }
    },

    "color-picker": {
      name: "color-picker",
      shouldDebounce: true
    },

    select: {
      name: "select",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    autocomplete: {
      name: "autocomplete",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    combobox: {
      name: "combobox",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    "number-combobox": {
      name: "number-combobox",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          },

          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          }
        }
      }
    },

    "checkbox-group": {
      name: "checkbox-group",
      itemsBased: true,
      multipleCompat: true
    },

    "switch-group": {
      name: "switch-group",
      itemsBased: true,
      multipleCompat: true
    },

    "radio-group": {
      name: "radio-group",
      itemsBased: true
    },

    "file-input": {
      name: "file-input",
      focusable: true,
      multipleCompat: true,
      isFileInput: true,

      schema: {
        properties: {
          accept: {
            type: "string"
          },

          placeholder: {
            type: "string"
          }
        }
      }
    },

    "one-of-select": {
      name: "one-of-select",

      schema: {
        required: ["oneOfItems"],

        properties: {
          emptyData: {
            type: "boolean"
          },

          autocomplete: {
            type: "boolean"
          },

          oneOfItems: {
            type: "array",

            items: {
              $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/one-of-item"
            }
          }
        }
      }
    }
  },

  localizeErrors: localizeErrors
};

const nodeComponents = {
  
  "section": sectionNode,
  
  "text-field": textfieldNode,
  
  "textarea": textareaNode,
  
  "combobox": comboboxNode,
  
  "switch": switchNode,
  
  "list": listNode,
  
  "autocomplete": autocompleteNode,
  
  "select": selectNode,
    
}

const props = defineProps({
  modelValue: {
    type: null,
    default: null
  },
  options: {
    /** @type import('vue').PropType<import('@koumoul/vjsf/types.js').PartialVjsfOptions | null> */
    type: Object,
    default: null
  }
})

const emit = defineEmits(emits)

const { el, statefulLayout, stateTree } = useVjsf(
  null,
  computed(() => props.modelValue),
  computed(() => ({...props.options, components: {}})),
  nodeComponents,
  emit,
  null,
  null,
  computed(() => compiledLayout)
)

</script>

<template>
  <div
    ref="el"
    class="vjsf"
  >
    <tree
      v-if="statefulLayout && stateTree"
      :model-value="stateTree"
      :stateful-layout="statefulLayout"
    />
  </div>
</template>