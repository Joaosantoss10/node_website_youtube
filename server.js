var express = require("express");
var app = express();
var http = require("http").createServer(app);

var mongoClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectId;

var bodyParser = require("body-parser");
var bcrypt = require("bcryptjs"); //Encriptação

var formidable = require("formidable"); //Upload de Vídeos
var fileSystem = require("fs");
const { getVideoDurationInSeconds } = require('get-video-duration');

app.use(bodyParser.json( { limit: "10000mb" } )); //Extrair dados com Express
app.use(bodyParser.urlencoded( { extended: true, limit: "10000mb", parameterLimit: 1000000 } ));

var expressSession = require("express-session");
app.use(expressSession({
	"key": "user_id",
	"secret": "User secret object ID",
	"resave": true,
	"saveUninitialized": true
}));

app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

var database = null;

// Função para Retornar os Dados do Utilizador
function getUser(userId, callBack) {
	database.collection("users").findOne({
		"_id": ObjectId(userId)
	}, function (error, result) {
		if (error) {
			console.log(error);
			return;
		}
		if (callBack != null) {
			callBack(result);
		}
	});
}

// Ligar o Servidor
http.listen(3000, function () {
	console.log("ISLÃO A DAR-LHE FORTE: http://localhost:3000/");

	// Ligação a Base de Dados
	mongoClient.connect("mongodb://127.0.0.1:27017", { useUnifiedTopology: true }, function (error, client) {
		if (error) {
			console.log(error);
			return;
		}
		// Base de Dados
		database = client.db("ISLAO");

		app.get("/", function (request, result) {
			database.collection("videos").find({}).sort({"createdAt": -1}).toArray(function (error1, videos) {
				result.render("index", {
					"isLogin": request.session.user_id ? true : false,
					"videos": videos,
					"url": request.url
				});
			});
		});

		// Ligação a Página Register
		app.get("/register", function (request, result) {
			if (request.session.user_id) {
				result.redirect("/");
				return;
			}
			result.render("register", {
				"error": "",
				"message": ""
			});
		});

		// Registar
		app.post("/register", function (request, result) {
			var first_name = request.body.first_name;
			var last_name = request.body.last_name;
			var email = request.body.email;
			var password = request.body.password;

			//Verifica se os Campos Estão Preenchidos
			if (first_name == "" || last_name == "" || email == "" || password == "") {
				result.render("register", {
					"error": "Por Favor Preencha Todos os Campos!",
					"message": ""
				});
				return;
			}
			// Verificação de Email
			database.collection("users").findOne({
				"email": email
			}, function (error1, user) {
				if (error1) {
					console.log(error1);
					return;
				}
				if (user == null) { //Não Existe
					bcrypt.genSalt(10, function(err, salt) {
    					bcrypt.hash(password, salt, async function(err, hash) { //Encripta Password
    						database.collection("users").insertOne({
								"first_name": first_name, // Nome
								"last_name": last_name, // Apelido
								"email": email, // Email
								"password": hash, //Password Encriptada
								"subscribers": 0, // Número de Subscritores
								"subscriptions": [], // Canais Subscritos
							}, function (error2, data) {
								if (error2) {
									console.log(error2);
									return;
								}
								result.render("register", {
									"error": "",
									"message": "Registo Efectuado com Sucesso!"
								});
							});
    					})
    				})
				} else {
					result.render("register", {
						"error": "Esse Email Já Está Registado!",
						"message": ""
					});
				}
			});
		});

		// Ligação a Página Login
		app.get("/login", function (request, result) {
			if (request.session.user_id) {
				result.redirect("/");
				return;
			}
			result.render("login", {
				"error": "",
				"message": ""
			});
		});

		// Iniciar Sessão
		app.post("/login", function (request, result) { 
			var email = request.body.email;
			var password = request.body.password;

			// Verifica se os Campos Estão Preenchidos
			if (email == "" || password == "") {
				result.render("login", {
					"error": "Por Favor, Preencha Todos os Campos!",
					"message": ""
				});
				return;
			}

			database.collection("users").findOne({ // Verifica se o Email Existe
				"email": email
			}, function (error1, user) {
				if (error1) {
					console.log(error1);
					return;
				}
				
				if (user == null) {
					result.render("login", {
						"error": "Email Não Existe!",
						"message": ""
					});
				} else {
					// Verifica se a Password é Igual a da Base de Dados (Encriptada)
					bcrypt.compare(password, user.password, function (error2, res) {
						if (res === true) { // Guarda o ID da Sessão
							request.session.user_id = user._id;
							result.redirect("/");
						} else {
							result.render("login", {
								"error": "Password Incorreta!",
								"message": ""
							});
						}
					});
				}
			});
		});
		
		// Sair da Sessão
		app.get("/logout", function (request, result) {
			request.session.destroy();
			result.redirect("/login");
		});
		
		app.get("/upload", function (request, result) {
			if (request.session.user_id) {
				// Verifica se Tem Sessão Iniciada
				getUser(request.session.user_id, function (user) { // Cria uma Página Nova para Carregar Vídeos
					result.render("upload", {
						"isLogin": true,
						"user": user,
						"url": request.url
					});
				});
			} else {
				// Sem Sessão Iniciada Redirecina Para a Página de Login
				result.redirect("/login");
			}
		});

		// Dados do Utilizador
		app.get("/get_user", function (request, result) {
			if (request.session.user_id) {
				getUser(request.session.user_id, function (user) {
					if (user == null) {
						result.json({
							"status": "error",
							"message": "Utilizador Não Encontrado!"
						});
					} else {
						delete user.password;

						result.json({
							"status": "success",
							"message": "Registo Obtido Com Sucesso",
							"user": user
						});
					}
				});
			} else {
				result.json({
					"status": "error",
					"message": "Por Favor Faça Login"
				});
			}
		});

		// Carregar Vídeo
		app.post("/upload-video", function (request, result) {
			if (request.session.user_id) { // Verifica se a Sessão está Iniciada
				
				var formData = new formidable.IncomingForm();
				formData.maxFileSize = 1000 * 1024 * 1204;
				formData.parse(request, function (error1, fields, files) {
					var oldPath = files.video.path;
					var newPath = "public/videos/" + new Date().getTime() + "-" + files.video.name;

					var title = fields.title;
					var description = fields.description;
					var tags = fields.tags;
					var videoId = fields.videoId;
					var thumbnail = fields.thumbnailPath;

					var oldPathThumbnail = files.thumbnail.path;
					var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;

					fileSystem.rename(oldPathThumbnail, thumbnail, function (error2) {
						
					});

					fileSystem.rename(oldPath, newPath, function (error2) {
						// Obtem os Dados do Utilizador para Guardar no Vídeo
						getUser(request.session.user_id, function (user) {
							
							delete user.password;
							var currentTime = new Date().getTime();

                            // Obtem a Duracao do Vídeo
							getVideoDurationInSeconds(newPath).then((duration) => {
								var hours = Math.floor(duration / 60 / 60);
								var minutes = Math.floor(duration / 60) - (hours * 60);
								var seconds = Math.floor(duration % 60);

								// Insere na Base de Dados
								database.collection("videos").insertOne({
									"user": {
										"_id": user._id,
										"first_name": user.first_name,
										"last_name": user.last_name,
										"image": user.image,
										"subscribers": 0,
										"subscriptions": [],
									},
									"filePath": newPath,
									"createdAt": currentTime,
									"views": 0,
									"watch": currentTime,
									"minutes": minutes,
									"seconds": seconds,
									"hours": hours,
									"title": title,
									"description": description,
									"tags": tags,
									"category": fields.category,
									"likers": [],
                                    "dislikers": [],
									"thumbnail": thumbnail
								}, function (error3, data) {

									// Insere na Tabela do Utilizador
									database.collection("users").updateOne({
										"_id": ObjectId(request.session.user_id)
									}, {
										$push: {
											"videos": {
												"_id": data.insertedId,
												"filePath": newPath,
												"createdAt": currentTime,
												"views": 0,
												"watch": currentTime,
												"minutes": minutes,
												"seconds": seconds,
												"hours": hours,
												"title": title,
												"description": description,
												"tags": tags,
												"category": fields.category,
												"likers": [],
                                    			"dislikers": [],
												"thumbnail": thumbnail,
											}
										}
									}, function (error4, data1) {
										result.redirect("/my_channel");
									});
								});
							});
						});
					});
				});
			} else {
				result.json({
					"status": "error",
					"message": "Por Favor Faça Login"
				});
			}
		});

		// Editar Vídeo
		app.post("/edit", function (request, result) {
			if (request.session.user_id) {

				var formData = new formidable.IncomingForm();
				formData.parse(request, function (error1, fields, files) {
					var title = fields.title;
					var description = fields.description;
					var tags = fields.tags;
					var videoId = fields.videoId;
					var thumbnail = fields.thumbnailPath;

					if (files.thumbnail.size > 0) {
						
						if (typeof fields.thumbnailPath !== "undefined" && fields.thumbnailPath != "") {
							fileSystem.unlink(fields.thumbnailPath, function (error3) {
								//
							});
						}

						var oldPath = files.thumbnail.path;
						var newPath = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;
						thumbnail = newPath;

						fileSystem.rename(oldPath, newPath, function (error2) {
							//
						});
					}

					database.collection("users").findOne({
						"_id": ObjectId(request.session.user_id),
						"videos._id": ObjectId(videoId)
					}, function (error1, video) {
						if (video == null) {
							result.send("Desculpe, Mas Não é o Dono do Vídeo!");
						} else {
							database.collection("videos").findOneAndUpdate({
								"_id": ObjectId(videoId)
							}, {
								$set: {
									"title": title,
									"description": description,
									"tags": tags,
									"category": fields.category,
									"thumbnail": thumbnail
								}
							}, function (error1, data) {

								database.collection("users").findOneAndUpdate({
									$and: [{
										"_id": ObjectId(request.session.user_id)
									}, {
										"videos._id": ObjectId(videoId)
									}]
								}, {
									$set: {
										"videos.$.title": title,
										"videos.$.description": description,
										"videos.$.tags": tags,
										"videos.$.category": fields.category,
										"videos.$.thumbnail": thumbnail
									}
								}, function (error2, data1) {
									getUser(request.session.user_id, function (user) {
										var video = data.value;
										video.thumbnail = thumbnail;

										result.render("edit-video", {
											"isLogin": true,
											"video": video,
											"user": user,
											"url": request.url,
											"message": "Alterações Guardas com Sucesso!"
										});
									});
								});
							});
						}
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/watch", function (request, result) {
			database.collection("videos").findOne({
				"watch": parseInt(request.query.v)
			}, function (error1, video) {
				if (video == null) {
					result.render("404", {
						"isLogin": request.session.user_id ? true : false,
						"message": "Vídeo Não Existe!",
						"url": request.url
					});
				} else {

					database.collection("videos").updateOne({
						"_id": ObjectId(video._id)
					}, {
						$inc: {
							"views": 1
						}
					});

					database.collection("users").updateOne({
						$and: [{
							"_id": ObjectId(video.user._id)
						}, {
							"videos._id": ObjectId(video._id)
						}]
					}, {
						$inc: {
							"videos.$.views": 1
						}
					});

					getUser(video.user._id, function (user) {
						result.render("video-page", {
							"isLogin": request.session.user_id ? true : false,
							"video": video,
							"user": user,
							"url": request.url
						});
					});
				}
			});
		});

		// Página do Canal
		app.get("/channel", function (request, result) {
			database.collection("users").findOne({
				"_id": ObjectId(request.query.c)
			}, function (error1, user) {
				if (user == null) {
					result.render("404", {
						"isLogin": request.session.user_id ? true : false,
						"message": "O Canal Não Foi Encontrado",
						"url": request.url
					});
				} else {
					result.render("single-channel", {
						"isLogin": request.session.user_id ? true : false,
						"user": user,
						"headerClass": "single-channel-page",
						"footerClass": "ml-0",
						"isMyChannel": request.session.user_id == request.query.c,
						"error": request.query.error ? request.query.error : "",
						"url": request.url,
						"message": request.query.message ? request.query.message : "",
						"error": ""
					});
				}
			});
		});

		// O Meu Canal
		app.get("/my_channel", function (request, result) {
			if (request.session.user_id) {
				database.collection("users").findOne({
					"_id": ObjectId(request.session.user_id)
				}, function (error1, user) {
					result.render("single-channel", {
						"isLogin": true,
						"user": user,
						"headerClass": "single-channel-page",
						"footerClass": "ml-0",
						"isMyChannel": true,
						"message": request.query.message ? request.query.message : "",
						"error": request.query.error ? request.query.error : "",
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		// Editar Vídeo
		app.get("/edit", function (request, result) {
			if (request.session.user_id) {
				database.collection("videos").findOne({
					"watch": parseInt(request.query.v)
				}, function (error1, video) {
					if (video == null) {
						result.render("404", {
							"isLogin": true,
							"message": "Este Vídeo Não Existe!",
							"url": request.url
						});
					} else {
						if (video.user._id != request.session.user_id) {
							result.send("Desculpe Mas Não é o Dono do Vídeo");
						} else {
							getUser(request.session.user_id, function (user) {
								result.render("edit-video", {
									"isLogin": true,
									"video": video,
									"user": user,
									"url": request.url
								});
							});
						}
					}
				});
			} else {
				result.redirect("/login");
			}
		});

		// Like
		app.post("/do-like", function(request, result) {
            if (request.session.user_id) {
                // Verifica se Já tem o Like

                database.collection("videos").findOne({
                    $and: [{
                        "_id": ObjectId(request.body.videoId)
                    }, {
                        "likers._id": request.session.user_id
                    }]
                }, function (error, video) {
                    if (video == null) {
                        //

                        database.collection("videos").updateOne({
                            "_id": ObjectId(request.body.videoId)
                        }, {
                            $push: {
                                "likers": {
                                    "_id": request.session.user_id
                                }
                            }
                        }, function (error, data) {
                            result.json({
                                "status": "sucess",
                                "message": "Gostou do Video!"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "Já deu Like!"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Tens de ter Login Dado!"
                });
            }
        });

		// Dislike
        app.post("/do-dislike", function(request, result) {
            if (request.session.user_id) {
                // Verifica se Já Tem o Dislike

                database.collection("videos").findOne({
                    $and: [{
                        "_id": ObjectId(request.body.videoId)
                    }, {
                        "dislikers._id": request.session.user_id
                    }]
                }, function (error, video) {
                    if (video == null) {
                        //

                        database.collection("videos").updateOne({
                            "_id": ObjectId(request.body.videoId)
                        }, {
                            $push: {
                                "dislikers": {
                                    "_id": request.session.user_id
                                }
                            }
                        }, function (error, data) {
                            result.json({
                                "status": "sucess",
                                "message": "Não Gostou do Vídeo!"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "Já deu Dislike!"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Tens de ter Login Dado!"
                });
            }
        });
 
		// Subscrever
		// app.post("/do-subscribe", function (request, result) {
		// 	if (request.session.user_id) {
		// 		database.collection("videos").findOne({
		// 			"_id": ObjectId(request.body.videoId)
		// 		}, function (error5, video) {
		// 			if (request.session.user_id == video.user._id) {
		// 				result.json ({
		// 					"status": "error",
		// 					"message": "Não Podes Subscrever o Teu Próprio Canal"
		// 				});
		// 			} else {	

		// 				//Verifica se o canal já esta subscriito
		// 				getUser(request.session.user_id, function (myData) {
		// 					var flag = false;
		// 					for (var a = 0; a < myData.subscriptions.lenght; a++) {
		// 						if (myData.subscriptions[a]._id.toString() == video.user._id.toString()) {
		// 							flag = true;
		// 							break;
		// 						}
		// 					}
		// 					 if (flag) {
		// 						result.json ({
		// 							"status": "error",
		// 							"message": "Já é Subscrito!"
		// 						});
		// 					 } else {
								 
		// 						database.collection("users").findOneAndUpdate({
		// 							"_id": video.user._id
		// 						}, {
		// 							$inc: {
		// 								"subscribers": 1
		// 							}
		// 						}, {
		// 							returnOriginal: false
		// 						}, function (error6, userData) {

		// 							database.collection("users").updateOne({
		// 								"_id": ObjectId(request.session.user_id)
		// 							}, {
		// 								$push: {
		// 									"subscriptions": {
		// 										"_id": video.user._id,
		// 										"name": video.user.name,
		// 										"subscribers": usarData.value.subscribers,
		// 										"image": userData.value.image
		// 									}
		// 								}
		// 							}, function (error7, data) {

		// 								database.collection("videos").findOneAndUpdate({
		// 									"_id": ObjectId(request.body.videoId)
		// 								}, {
		// 									$inc: {
		// 										"user.subscribers": 1
		// 									}
		// 								});

		// 								result.json({
		// 									"status": "sucess",
		// 									"message": "Subscrito!"
		// 								});
		// 							});
		// 						});
		// 					}
		// 				});
		// 			}
		// 		});
		// 	} else {
		// 		result.json({
		// 			"status": "error",
		// 			"message": "Faça Login!"
		// 		});
		// 	}
		// });

		// Comentar
		app.post("/do-comment", function (request, result) {
			if (request.session.user_id) {
				var comment = request.body.comment;
				var videoId = request.body.videoId;

				getUser(request.session.user_id, function (user) {
					delete user.password;

					database.collection("videos").findOneAndUpdate({
						"_id": ObjectId(videoId)
					}, {
						$push: {
							"comments": {
								"_id": ObjectId(),
								"user": {
									"_id": user._id,
									"first_name": user.first_name,
									"last_name": user.last_name,
									"image": user.image
								},
								"comment": comment,
								"createdAt": new Date().getTime()
							}
						}
					}, function (error1, data) {
						result.json({
							"status": "success",
							"message": "Comentário Publicado!",
							"user": {
								"_id": user._id,
								"first_name": user.first_name,
								"last_name": user.last_name,
								"image": user.image
							},
							"comment": comment
						});
					});
				});
			} else {
				result.json({
					"status": "danger",
					"message": "Faça Login!"
				});
			}
		});

		// Responder
		app.post("/do-reply", function (request, result) {
			if (request.session.user_id) {
				var reply = request.body.reply;
				var commentId = request.body.commentId;

				getUser(request.session.user_id, function (user) {
					delete user.password;

					var replyObject = {
						"_id": ObjectId(),
						"user": {
							"_id": user._id,
							"first_name": user.first_name,
							"last_name": user.last_name,
							"image": user.image
						},
						"reply": reply,
						"createdAt": new Date().getTime()
					};

					database.collection("videos").findOneAndUpdate({
						"comments._id": ObjectId(commentId)
					}, {
						$push: {
							"comments.$.replies": replyObject
						}
					}, function (error1, data) {
						result.json({
							"status": "success",
							"message": "Comentário Foi Publicado!",
							"user": {
								"_id": user._id,
								"first_name": user.first_name,
								"last_name": user.last_name,
								"image": user.image
							},
							"reply": reply
						});
					});
				});
			} else {
				result.json({
					"status": "danger",
					"message": "Faça Login!"
				});
			}
		});

		// Vídeos Relacionados
		app.get("/get-related-videos", function (request, result) {
			database.collection("videos").find({
				$and: [{
					"category": request.query.category
				}, {
					"_id": {
						$ne: ObjectId(request.query.videoId)
					}
				}]
			}).toArray(function (error1, videos) {
				result.json(videos);
			});
		});

		// Procurar
		app.get("/search", function (request, result) {
			database.collection("videos").find({
				"title":  {
					$regex: request.query.search_query,
					$options: "i"
				}
			}).toArray(function (error1, videos) {
				result.render("search-query", {
					"isLogin": request.session.user_id ? true : false,
					"videos": videos,
					"query": request.query.search_query,
					"url": request.url
				});
			});
		});

		// Editar Perfil - Receber Dados da Alteração
		app.get("/my_settings", function (request, result) {
			if (request.session.user_id) {
				getUser(request.session.user_id, function (user) {
					result.render("settings", {
						"isLogin": true,
						"user": user,
						"message": request.query.message ? "Definições Alteradas Com Sucesso" : "",
						"error": request.query.error ? "Por Favor Preencha Todos os Campos" : "",
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.post("/save_settings", function (request, result) {
			if (request.session.user_id) {
				var password = request.body.password;

				if (request.body.first_name == "" || request.body.last_name == "") {
					result.redirect("/my_settings?error=1");
					return;
				}

				if (password == "") {
					database.collection("users").updateOne({
						"_id": ObjectId(request.session.user_id)
					}, {
						$set: {
							"first_name": request.body.first_name,
							"last_name": request.body.last_name
						}
					});
				} else {
					bcrypt.genSalt(10, function(err, salt) {
						bcrypt.hash(password, salt, async function(err, hash) {
							database.collection("users").updateOne({
								"_id": ObjectId(request.session.user_id)
							}, {
								$set: {
									"first_name": request.body.first_name,
									"last_name": request.body.last_name,
									"password": hash
								}
							})
						})
					})
				}
				result.redirect("/my_settings?message=1");
			} else {
				result.redirect("/login");
			}
		});

		// Apagar Vídeo
		app.get("/delete-video", function (request, result) {
			if (request.session.user_id) {
				database.collection("videos").findOne({
					$and: [{
						"user._id": ObjectId(request.session.user_id)
					}, {
						"watch": parseInt(request.query.v)
					}]
				}, function (error1, video) {
					if (video == null) {
						result.render("404", {
							"isLogin": true,
							"message": "Desculpe Não é o Dono do Vídeo."
						});
					} else {
						database.collection("videos").findOne({
							"_id": ObjectId(video._id)
						}, function (error3, videoData) {
							fileSystem.unlink(videoData.filePath, function (errorUnlink) {
								if (errorUnlink) {
									console.log(errorUnlink);
								}

								database.collection("videos").deleteOne({
									$and: [{
										"_id": ObjectId(video._id)
									}, {
										"user._id": ObjectId(request.session.user_id)
									}]
								});
							});
						});

						database.collection("users").findOneAndUpdate({
							"_id": ObjectId(request.session.user_id)
						}, {
							$pull: {
								"videos": {
									"_id": ObjectId(video._id)
								}
							}
						}, function (error2, data) {
							result.redirect("/my_channel");
						});
					}
				});
			} else {
				result.redirect("/login");
			}
		});

	}); // Fim do Mongo DB
}); //  Fim do HTTP.listen
