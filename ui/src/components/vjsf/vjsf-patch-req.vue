<script setup>
// @ts-nocheck

import { StatefulLayout } from '@json-layout/core/state'
import { ref, shallowRef, getCurrentInstance, useSlots, computed } from 'vue'
import { useElementSize } from '@vueuse/core'

import Tree from '@koumoul/vjsf/components/tree.vue'
import { useVjsf, emits } from '@koumoul/vjsf/composables/use-vjsf.js'
import '@koumoul/vjsf/styles/vjsf.css'


import sectionNode from '@koumoul/vjsf/components/nodes/section.vue'

import selectNode from '@koumoul/vjsf/components/nodes/select.vue'

import textfieldNode from '@koumoul/vjsf/components/nodes/text-field.vue'

import checkboxNode from '@koumoul/vjsf/components/nodes/checkbox.vue'

import listNode from '@koumoul/vjsf/components/nodes/list.vue'


import localizeErrors from "ajv-i18n/localize/fr/index.js";
const schema26 = {"$id":"export0","$ref":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"};
const schema28 = {"type":"object","additionalProperties":false,"required":["type","id"],"properties":{"type":{"type":"string","enum":["user","organization"],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type","errorMessage":{}},"id":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id","errorMessage":{}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}};
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
for(const key0 in data){
if(!((key0 === "type") || (key0 === "id"))){
const err2 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.type.type,parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data0 === "user") || (data0 === "organization"))){
const err4 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema28.properties.type.enum},message:"must be equal to one of the allowed values",schema:schema28.properties.type.enum,parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err5 of vErrors){
if(!err5.emUsed){
emErrs0.push(err5);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.id.type,parentSchema:schema28.properties.id,data:data1};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err7 of vErrors){
if(!err7.emUsed){
emErrs1.push(err7);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema28.type,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err9 of vErrors){
if((((((err9.keyword !== "errorMessage") && (!err9.emUsed)) && (err9.instancePath === instancePath)) && (err9.keyword in emErrors0)) && (err9.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err9.schemaPath.slice(92)))){
emPropParams0 = obj0[err9.keyword];
emParamsErrors0 = emErrors0[err9.keyword][err9.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err9);
err9.emUsed = true;
}
}
}
for(const key1 in emErrors0){
for(const keyProp0 in emErrors0[key1]){
emParamsErrors0 = emErrors0[key1][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key1] && templates0[key1][keyProp0];
const err10 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema28.errorMessage[key1][keyProp0],schema:schema28.errorMessage,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
const emErrs2 = [];
for(const err11 of vErrors){
if(!err11.emUsed){
emErrs2.push(err11);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema29 = {"$id":"export1","$ref":"https://github.com/data-fair/registry/artefact-patch#"};
const schema27 = {"$id":"https://github.com/data-fair/registry/artefact-patch","x-exports":["validate","types","vjsf"],"title":"Artefact patch","type":"object","additionalProperties":false,"properties":{"category":{"type":"string","enum":["processing","catalog","application","tileset","other"],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/category","errorMessage":{}},"title":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"fr":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr","errorMessage":{}},"en":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title","errorMessage":{}},"description":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"fr":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr","errorMessage":{}},"en":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description","errorMessage":{}},"thumbnail":{"anyOf":[{"type":"string"},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail","errorMessage":{}},"public":{"anyOf":[{"type":"boolean","default":false},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/public","errorMessage":{}},"privateAccess":{"anyOf":[{"type":"array","items":{"type":"object","additionalProperties":false,"required":["type","id"],"properties":{"type":{"type":"string","enum":["user","organization"],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type","errorMessage":{}},"id":{"type":"string","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id","errorMessage":{}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess","errorMessage":{}},"processingConfigSchema":{"anyOf":[{"type":"object"},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema","errorMessage":{}},"applicationConfigSchema":{"anyOf":[{"type":"object"},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema","errorMessage":{}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#","errorMessage":{}};

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
if(!((((((((key0 === "category") || (key0 === "title")) || (key0 === "description")) || (key0 === "thumbnail")) || (key0 === "public")) || (key0 === "privateAccess")) || (key0 === "processingConfigSchema")) || (key0 === "applicationConfigSchema"))){
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
if(data.category !== undefined){
let data0 = data.category;
if(typeof data0 !== "string"){
const err1 = {instancePath:instancePath+"/category",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/category/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.category.type,parentSchema:schema27.properties.category,data:data0};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(!(((((data0 === "processing") || (data0 === "catalog")) || (data0 === "application")) || (data0 === "tileset")) || (data0 === "other"))){
const err2 = {instancePath:instancePath+"/category",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/category/enum",keyword:"enum",params:{allowedValues: schema27.properties.category.enum},message:"must be equal to one of the allowed values",schema:schema27.properties.category.enum,parentSchema:schema27.properties.category,data:data0};
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
if(data.title !== undefined){
let data1 = data.title;
const _errs6 = errors;
let valid2 = false;
const _errs7 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
if(!((key1 === "fr") || (key1 === "en"))){
const err4 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.title.anyOf[0],data:data1};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data1.fr !== undefined){
let data2 = data1.fr;
if(typeof data2 !== "string"){
const err5 = {instancePath:instancePath+"/title/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.fr.type,parentSchema:schema27.properties.title.anyOf[0].properties.fr,data:data2};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err6 of vErrors){
if(!err6.emUsed){
emErrs1.push(err6);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
if(data1.en !== undefined){
let data3 = data1.en;
if(typeof data3 !== "string"){
const err7 = {instancePath:instancePath+"/title/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.en.type,parentSchema:schema27.properties.title.anyOf[0].properties.en,data:data3};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(errors > 0){
const emErrs2 = [];
for(const err8 of vErrors){
if(!err8.emUsed){
emErrs2.push(err8);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
}
}
else {
const err9 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.title.anyOf[0].type,parentSchema:schema27.properties.title.anyOf[0],data:data1};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs7 === errors;
valid2 = valid2 || _valid0;
const _errs14 = errors;
if(data1 !== null){
const err10 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.title.anyOf[1].type,parentSchema:schema27.properties.title.anyOf[1],data:data1};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs14 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err11 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.title.anyOf,parentSchema:schema27.properties.title,data:data1};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
errors = _errs6;
if(vErrors !== null){
if(_errs6){
vErrors.length = _errs6;
}
else {
vErrors = null;
}
}
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
if(data.description !== undefined){
let data4 = data.description;
const _errs17 = errors;
let valid4 = false;
const _errs18 = errors;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
for(const key2 in data4){
if(!((key2 === "fr") || (key2 === "en"))){
const err13 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.description.anyOf[0],data:data4};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data4.fr !== undefined){
let data5 = data4.fr;
if(typeof data5 !== "string"){
const err14 = {instancePath:instancePath+"/description/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.fr.type,parentSchema:schema27.properties.description.anyOf[0].properties.fr,data:data5};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(errors > 0){
const emErrs4 = [];
for(const err15 of vErrors){
if(!err15.emUsed){
emErrs4.push(err15);
}
}
vErrors = emErrs4;
errors = emErrs4.length;
}
}
if(data4.en !== undefined){
let data6 = data4.en;
if(typeof data6 !== "string"){
const err16 = {instancePath:instancePath+"/description/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.en.type,parentSchema:schema27.properties.description.anyOf[0].properties.en,data:data6};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(errors > 0){
const emErrs5 = [];
for(const err17 of vErrors){
if(!err17.emUsed){
emErrs5.push(err17);
}
}
vErrors = emErrs5;
errors = emErrs5.length;
}
}
}
else {
const err18 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.description.anyOf[0].type,parentSchema:schema27.properties.description.anyOf[0],data:data4};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid4 = valid4 || _valid1;
const _errs25 = errors;
if(data4 !== null){
const err19 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.description.anyOf[1].type,parentSchema:schema27.properties.description.anyOf[1],data:data4};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid1 = _errs25 === errors;
valid4 = valid4 || _valid1;
if(!valid4){
const err20 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.description.anyOf,parentSchema:schema27.properties.description,data:data4};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
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
if(data.thumbnail !== undefined){
let data7 = data.thumbnail;
const _errs28 = errors;
let valid6 = false;
const _errs29 = errors;
if(typeof data7 !== "string"){
const err22 = {instancePath:instancePath+"/thumbnail",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.thumbnail.anyOf[0].type,parentSchema:schema27.properties.thumbnail.anyOf[0],data:data7};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid2 = _errs29 === errors;
valid6 = valid6 || _valid2;
const _errs31 = errors;
if(data7 !== null){
const err23 = {instancePath:instancePath+"/thumbnail",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.thumbnail.anyOf[1].type,parentSchema:schema27.properties.thumbnail.anyOf[1],data:data7};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid2 = _errs31 === errors;
valid6 = valid6 || _valid2;
if(!valid6){
const err24 = {instancePath:instancePath+"/thumbnail",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.thumbnail.anyOf,parentSchema:schema27.properties.thumbnail,data:data7};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs28;
if(vErrors !== null){
if(_errs28){
vErrors.length = _errs28;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs7 = [];
for(const err25 of vErrors){
if(!err25.emUsed){
emErrs7.push(err25);
}
}
vErrors = emErrs7;
errors = emErrs7.length;
}
}
if(data.public !== undefined){
let data8 = data.public;
const _errs34 = errors;
let valid7 = false;
const _errs35 = errors;
if(typeof data8 !== "boolean"){
const err26 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0/type",keyword:"type",params:{type: "boolean"},message:"must be boolean",schema:schema27.properties.public.anyOf[0].type,parentSchema:schema27.properties.public.anyOf[0],data:data8};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid3 = _errs35 === errors;
valid7 = valid7 || _valid3;
const _errs37 = errors;
if(data8 !== null){
const err27 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.public.anyOf[1].type,parentSchema:schema27.properties.public.anyOf[1],data:data8};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid3 = _errs37 === errors;
valid7 = valid7 || _valid3;
if(!valid7){
const err28 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.public.anyOf,parentSchema:schema27.properties.public,data:data8};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
errors = _errs34;
if(vErrors !== null){
if(_errs34){
vErrors.length = _errs34;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs8 = [];
for(const err29 of vErrors){
if(!err29.emUsed){
emErrs8.push(err29);
}
}
vErrors = emErrs8;
errors = emErrs8.length;
}
}
if(data.privateAccess !== undefined){
let data9 = data.privateAccess;
const _errs40 = errors;
let valid8 = false;
const _errs41 = errors;
if(Array.isArray(data9)){
const len0 = data9.length;
for(let i0=0; i0<len0; i0++){
let data10 = data9[i0];
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.type === undefined){
const err30 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.required,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data10};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data10.id === undefined){
const err31 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.required,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data10};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key3 in data10){
if(!((key3 === "type") || (key3 === "id"))){
const err32 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data10};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data10.type !== undefined){
let data11 = data10.type;
if(typeof data11 !== "string"){
const err33 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.properties.type.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.type,data:data11};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!((data11 === "user") || (data11 === "organization"))){
const err34 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema27.properties.privateAccess.anyOf[0].items.properties.type.enum},message:"must be equal to one of the allowed values",schema:schema27.properties.privateAccess.anyOf[0].items.properties.type.enum,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.type,data:data11};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(errors > 0){
const emErrs9 = [];
for(const err35 of vErrors){
if(!err35.emUsed){
emErrs9.push(err35);
}
}
vErrors = emErrs9;
errors = emErrs9.length;
}
}
if(data10.id !== undefined){
let data12 = data10.id;
if(typeof data12 !== "string"){
const err36 = {instancePath:instancePath+"/privateAccess/" + i0+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.properties.id.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.properties.id,data:data12};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(errors > 0){
const emErrs10 = [];
for(const err37 of vErrors){
if(!err37.emUsed){
emErrs10.push(err37);
}
}
vErrors = emErrs10;
errors = emErrs10.length;
}
}
}
else {
const err38 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.privateAccess.anyOf[0].items.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data10};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err39 of vErrors){
if((((((err39.keyword !== "errorMessage") && (!err39.emUsed)) && (err39.instancePath === instancePath+"/privateAccess/" + i0)) && (err39.keyword in emErrors0)) && (err39.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err39.schemaPath.slice(92)))){
emPropParams0 = obj0[err39.keyword];
emParamsErrors0 = emErrors0[err39.keyword][err39.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err39);
err39.emUsed = true;
}
}
}
for(const key4 in emErrors0){
for(const keyProp0 in emErrors0[key4]){
emParamsErrors0 = emErrors0[key4][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key4] && templates0[key4][keyProp0];
const err40 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema27.properties.privateAccess.anyOf[0].items.errorMessage[key4][keyProp0],schema:schema27.properties.privateAccess.anyOf[0].items.errorMessage,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data10};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
const emErrs11 = [];
for(const err41 of vErrors){
if(!err41.emUsed){
emErrs11.push(err41);
}
}
vErrors = emErrs11;
errors = emErrs11.length;
}
}
}
else {
const err42 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/type",keyword:"type",params:{type: "array"},message:"must be array",schema:schema27.properties.privateAccess.anyOf[0].type,parentSchema:schema27.properties.privateAccess.anyOf[0],data:data9};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var _valid4 = _errs41 === errors;
valid8 = valid8 || _valid4;
const _errs50 = errors;
if(data9 !== null){
const err43 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.privateAccess.anyOf[1].type,parentSchema:schema27.properties.privateAccess.anyOf[1],data:data9};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var _valid4 = _errs50 === errors;
valid8 = valid8 || _valid4;
if(!valid8){
const err44 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.privateAccess.anyOf,parentSchema:schema27.properties.privateAccess,data:data9};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
errors = _errs40;
if(vErrors !== null){
if(_errs40){
vErrors.length = _errs40;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs12 = [];
for(const err45 of vErrors){
if(!err45.emUsed){
emErrs12.push(err45);
}
}
vErrors = emErrs12;
errors = emErrs12.length;
}
}
if(data.processingConfigSchema !== undefined){
let data13 = data.processingConfigSchema;
const _errs53 = errors;
let valid12 = false;
const _errs54 = errors;
if(!(data13 && typeof data13 == "object" && !Array.isArray(data13))){
const err46 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.processingConfigSchema.anyOf[0].type,parentSchema:schema27.properties.processingConfigSchema.anyOf[0],data:data13};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var _valid5 = _errs54 === errors;
valid12 = valid12 || _valid5;
const _errs56 = errors;
if(data13 !== null){
const err47 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.processingConfigSchema.anyOf[1].type,parentSchema:schema27.properties.processingConfigSchema.anyOf[1],data:data13};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var _valid5 = _errs56 === errors;
valid12 = valid12 || _valid5;
if(!valid12){
const err48 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.processingConfigSchema.anyOf,parentSchema:schema27.properties.processingConfigSchema,data:data13};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs53;
if(vErrors !== null){
if(_errs53){
vErrors.length = _errs53;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs13 = [];
for(const err49 of vErrors){
if(!err49.emUsed){
emErrs13.push(err49);
}
}
vErrors = emErrs13;
errors = emErrs13.length;
}
}
if(data.applicationConfigSchema !== undefined){
let data14 = data.applicationConfigSchema;
const _errs59 = errors;
let valid13 = false;
const _errs60 = errors;
if(!(data14 && typeof data14 == "object" && !Array.isArray(data14))){
const err50 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.applicationConfigSchema.anyOf[0].type,parentSchema:schema27.properties.applicationConfigSchema.anyOf[0],data:data14};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
var _valid6 = _errs60 === errors;
valid13 = valid13 || _valid6;
const _errs62 = errors;
if(data14 !== null){
const err51 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.applicationConfigSchema.anyOf[1].type,parentSchema:schema27.properties.applicationConfigSchema.anyOf[1],data:data14};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
var _valid6 = _errs62 === errors;
valid13 = valid13 || _valid6;
if(!valid13){
const err52 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.applicationConfigSchema.anyOf,parentSchema:schema27.properties.applicationConfigSchema,data:data14};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
else {
errors = _errs59;
if(vErrors !== null){
if(_errs59){
vErrors.length = _errs59;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs14 = [];
for(const err53 of vErrors){
if(!err53.emUsed){
emErrs14.push(err53);
}
}
vErrors = emErrs14;
errors = emErrs14.length;
}
}
}
else {
const err54 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.type,parentSchema:schema27,data};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(errors > 0){
const emErrs15 = [];
for(const err55 of vErrors){
if(!err55.emUsed){
emErrs15.push(err55);
}
}
vErrors = emErrs15;
errors = emErrs15.length;
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
return ([{"key":"processing","title":"processing","value":"processing"},{"key":"catalog","title":"catalog","value":"catalog"},{"key":"application","title":"application","value":"application"},{"key":"tileset","title":"tileset","value":"tileset"},{"key":"other","title":"other","value":"other"}])
}function expression2(data,value,options,context,display,layout,readOnly,summary,validates
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
      title: "",
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
      pure: true,
      propertyKeys: ["category", "title", "description", "thumbnail", "public", "privateAccess", "processingConfigSchema", "applicationConfigSchema"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/category", "https://github.com/data-fair/registry/artefact-patch#/properties/title", "https://github.com/data-fair/registry/artefact-patch#/properties/description", "https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail", "https://github.com/data-fair/registry/artefact-patch#/properties/public", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess", "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema", "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/category": {
      title: undefined,
      key: "category",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/category",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/category",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title": {
      title: undefined,
      key: "title",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      pure: true,
      propertyKeys: ["fr", "en"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr", "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      title: undefined,
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      title: undefined,
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
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
      propertyKeys: ["fr", "en"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr", "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      title: undefined,
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      title: undefined,
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail": {
      title: undefined,
      key: "thumbnail",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public": {
      title: undefined,
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
      title: undefined,
      key: "privateAccess",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      childrenTrees: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      title: undefined,
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      pure: true,
      propertyKeys: ["type", "id"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/type", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id"]
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

    "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema": {
      title: undefined,
      key: "processingConfigSchema",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema": {
      title: undefined,
      key: "applicationConfigSchema",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    }
  },

  normalizedLayouts: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      comp: "section",

      children: [{
        key: "category"
      }, {
        key: "title"
      }, {
        key: "description"
      }, {
        key: "thumbnail"
      }, {
        key: "public"
      }, {
        key: "privateAccess"
      }, {
        key: "processingConfigSchema"
      }, {
        key: "applicationConfigSchema"
      }],

      title: "Artefact patch",
      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/category": {
      comp: "select",

      getItems: {
        pure: true,
        type: "js-eval",
        dataAlias: "value",
        expr: "[{\"key\":\"processing\",\"title\":\"processing\",\"value\":\"processing\"},{\"key\":\"catalog\",\"title\":\"catalog\",\"value\":\"catalog\"},{\"key\":\"application\",\"title\":\"application\",\"value\":\"application\"},{\"key\":\"tileset\",\"title\":\"tileset\",\"value\":\"tileset\"},{\"key\":\"other\",\"title\":\"other\",\"value\":\"other\"}]",
        immutable: true,
        ref: 1
      },

      label: "category"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "fr"
      }, {
        key: "en"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      comp: "text-field",
      label: "fr"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      comp: "text-field",
      label: "en"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "fr"
      }, {
        key: "en"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      comp: "text-field",
      label: "fr"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      comp: "text-field",
      label: "en"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/thumbnail/anyOf/0": {
      comp: "text-field",
      nullable: true,
      label: "thumbnail"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0": {
      comp: "checkbox",
      nullable: true,
      label: "public",
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
      comp: "list",
      nullable: true,
      title: "privateAccess",
      listEditMode: "inline-single",
      listActions: ["add", "edit", "delete", "sort", "duplicate"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      comp: "section",

      children: [{
        key: "type"
      }, {
        key: "id"
      }],

      title: null,
      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      },

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
        ref: 2
      },

      label: "type"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/properties/id": {
      comp: "text-field",
      label: "id"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0": {
      comp: "section",
      nullable: true,
      children: [],
      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0": {
      comp: "section",
      nullable: true,
      children: [],
      title: null
    }
  },

  validates: {
    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": validate22,
    "https://github.com/data-fair/registry/artefact-patch#": validate24
  },

  validationErrors: {},
  expressions: [expression0, expression1, expression2],
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
  
  "select": selectNode,
  
  "text-field": textfieldNode,
  
  "checkbox": checkboxNode,
  
  "list": listNode,
    
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